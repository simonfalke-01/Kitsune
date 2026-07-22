//! Central outbound network policy with DNS rebinding and redirect defenses.

use std::{
    collections::BTreeSet,
    net::{IpAddr, SocketAddr},
};

use kitsune_core::{DomainError, DomainResult};
use url::{Host, Url};

/// Allow policy applied to webhooks, automation HTTP nodes, plugins, and remote
/// challenge probes.
#[derive(Debug, Clone)]
pub struct EgressPolicy {
    allowed_hosts: BTreeSet<String>,
    allowed_ports: BTreeSet<u16>,
    trusted_origins: BTreeSet<String>,
    permit_http: bool,
}

/// One policy-validated destination with its DNS answers pinned for the
/// subsequent HTTP connection.
#[derive(Debug, Clone)]
pub struct ValidatedEgress {
    host: Option<String>,
    addresses: Vec<SocketAddr>,
}

impl ValidatedEgress {
    /// Pins the already-validated DNS answers into a redirect-disabled reqwest
    /// client builder, closing the validation-to-connect rebinding window.
    pub fn configure_client(&self, mut builder: reqwest::ClientBuilder) -> reqwest::ClientBuilder {
        if let Some(host) = &self.host
            && !self.addresses.is_empty()
        {
            builder = builder.resolve_to_addrs(host, &self.addresses);
        }
        builder
    }
}

impl EgressPolicy {
    /// Safe public-HTTPS policy with optional explicit host allow-list. An empty
    /// host set permits public DNS names but still blocks all non-public IPs.
    pub fn public_https(allowed_hosts: BTreeSet<String>) -> Self {
        Self {
            allowed_hosts,
            allowed_ports: BTreeSet::from([443]),
            trusted_origins: BTreeSet::new(),
            permit_http: false,
        }
    }

    /// Development policy that also permits public HTTP on port 80. Private,
    /// loopback, link-local, multicast, and unspecified addresses remain denied.
    pub fn public_http_and_https(allowed_hosts: BTreeSet<String>) -> Self {
        Self {
            allowed_hosts,
            allowed_ports: BTreeSet::from([80, 443]),
            trusted_origins: BTreeSet::new(),
            permit_http: true,
        }
    }

    /// Adds exact operator-controlled origins that may resolve to private
    /// addresses or use non-default ports. This is intended for internal OIDC
    /// issuers and must only be sourced from trusted server configuration, never
    /// from request data or live tenant settings.
    pub fn with_trusted_origins(mut self, origins: BTreeSet<String>) -> DomainResult<Self> {
        for origin in origins {
            let url = Url::parse(&origin)
                .map_err(|_| DomainError::Validation("trusted origin is not a URL".into()))?;
            if !url.username().is_empty()
                || url.password().is_some()
                || url.query().is_some()
                || url.fragment().is_some()
                || !matches!(url.scheme(), "http" | "https")
                || url.host().is_none()
                || url.path() != "/"
            {
                return Err(DomainError::Validation(
                    "trusted origin must contain only an HTTP(S) scheme, host, and optional port"
                        .into(),
                ));
            }
            self.trusted_origins
                .insert(url.origin().ascii_serialization());
        }
        Ok(self)
    }

    /// Validates syntax, credentials, scheme, port, allow-list, and every DNS
    /// answer before a connection is opened.
    pub async fn validate(&self, url: &Url) -> DomainResult<()> {
        self.resolve(url).await.map(|_| ())
    }

    /// Validates a URL and returns the exact DNS answers that the HTTP client
    /// must use for the connection.
    pub async fn resolve(&self, url: &Url) -> DomainResult<ValidatedEgress> {
        if !url.username().is_empty() || url.password().is_some() {
            return Err(DomainError::Forbidden);
        }
        let trusted = self
            .trusted_origins
            .contains(&url.origin().ascii_serialization());
        let default_port = match url.scheme() {
            "https" => 443,
            "http" if self.permit_http || trusted => 80,
            _ => return Err(DomainError::Forbidden),
        };
        let port = url.port().unwrap_or(default_port);
        if !trusted && !self.allowed_ports.contains(&port) {
            return Err(DomainError::Forbidden);
        }
        let target = match url.host().ok_or(DomainError::Forbidden)? {
            Host::Ipv4(address) => {
                if !trusted {
                    validate_ip(IpAddr::V4(address))?;
                }
                ValidatedEgress {
                    host: None,
                    addresses: Vec::new(),
                }
            }
            Host::Ipv6(address) => {
                if !trusted {
                    validate_ip(IpAddr::V6(address))?;
                }
                ValidatedEgress {
                    host: None,
                    addresses: Vec::new(),
                }
            }
            Host::Domain(host) => {
                let host = host.to_ascii_lowercase();
                if !trusted && !self.allowed_hosts.is_empty() && !self.allowed_hosts.contains(&host)
                {
                    return Err(DomainError::Forbidden);
                }
                let addresses: Vec<_> = tokio::net::lookup_host((host.as_str(), port))
                    .await
                    .map_err(|_| DomainError::Unavailable("egress DNS lookup failed".into()))?
                    .collect();
                if addresses.is_empty() {
                    return Err(DomainError::Unavailable(
                        "egress DNS lookup returned no addresses".into(),
                    ));
                }
                if !trusted {
                    for address in &addresses {
                        validate_ip(address.ip())?;
                    }
                }
                ValidatedEgress {
                    host: Some(host),
                    addresses,
                }
            }
        };
        Ok(target)
    }
}

fn validate_ip(ip: IpAddr) -> DomainResult<()> {
    let forbidden = match ip {
        IpAddr::V4(ip) => {
            ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_broadcast()
                || ip.is_documentation()
                || ip.is_multicast()
                || ip.is_unspecified()
                || ip.octets()[0] == 0
                || ip.octets()[0] >= 240
                || (ip.octets()[0] == 100 && (64..=127).contains(&ip.octets()[1]))
                || (ip.octets()[0] == 198 && (18..=19).contains(&ip.octets()[1]))
        }
        IpAddr::V6(ip) => {
            ip.is_loopback()
                || ip.is_multicast()
                || ip.is_unspecified()
                || ip.is_unique_local()
                || ip.is_unicast_link_local()
                || ip
                    .to_ipv4_mapped()
                    .is_some_and(|mapped| validate_ip(IpAddr::V4(mapped)).is_err())
        }
    };
    if forbidden {
        Err(DomainError::Forbidden)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_every_private_address_family() {
        for address in [
            "127.0.0.1",
            "10.0.0.1",
            "172.16.0.1",
            "192.168.1.1",
            "169.254.169.254",
            "0.0.0.0",
            "100.64.0.1",
            "::1",
            "fc00::1",
            "fe80::1",
            "::ffff:127.0.0.1",
        ] {
            let ip: IpAddr = address.parse().expect("IP fixture");
            assert!(validate_ip(ip).is_err(), "accepted {ip}");
        }
    }

    #[tokio::test]
    async fn rejects_credentials_and_non_http_protocols() {
        let policy = EgressPolicy::public_http_and_https(BTreeSet::new());
        assert!(
            policy
                .validate(&Url::parse("http://user:pass@example.com").expect("URL"))
                .await
                .is_err()
        );
        assert!(
            policy
                .validate(&Url::parse("file:///etc/passwd").expect("URL"))
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn trusted_origins_are_exact_and_configuration_only() {
        let policy = EgressPolicy::public_https(BTreeSet::new())
            .with_trusted_origins(BTreeSet::from(["http://127.0.0.1:43123".into()]))
            .expect("trusted policy");
        assert!(
            policy
                .validate(&Url::parse("http://127.0.0.1:43123/issuer/jwks").expect("URL"))
                .await
                .is_ok()
        );
        assert!(
            policy
                .validate(&Url::parse("http://127.0.0.1:43124/issuer/jwks").expect("URL"))
                .await
                .is_err()
        );
        assert!(
            EgressPolicy::public_https(BTreeSet::new())
                .with_trusted_origins(BTreeSet::from([
                    "http://127.0.0.1:43123/not-an-origin".into()
                ]))
                .is_err()
        );
    }
}
