//! Central outbound network policy with DNS rebinding and redirect defenses.

use std::{collections::BTreeSet, net::IpAddr};

use kitsune_core::{DomainError, DomainResult};
use url::{Host, Url};

/// Allow policy applied to webhooks, automation HTTP nodes, plugins, and remote
/// challenge probes.
#[derive(Debug, Clone)]
pub struct EgressPolicy {
    allowed_hosts: BTreeSet<String>,
    allowed_ports: BTreeSet<u16>,
    permit_http: bool,
}

impl EgressPolicy {
    /// Safe public-HTTPS policy with optional explicit host allow-list. An empty
    /// host set permits public DNS names but still blocks all non-public IPs.
    pub fn public_https(allowed_hosts: BTreeSet<String>) -> Self {
        Self {
            allowed_hosts,
            allowed_ports: BTreeSet::from([443]),
            permit_http: false,
        }
    }

    /// Development policy that also permits public HTTP on port 80. Private,
    /// loopback, link-local, multicast, and unspecified addresses remain denied.
    pub fn public_http_and_https(allowed_hosts: BTreeSet<String>) -> Self {
        Self {
            allowed_hosts,
            allowed_ports: BTreeSet::from([80, 443]),
            permit_http: true,
        }
    }

    /// Validates syntax, credentials, scheme, port, allow-list, and every DNS
    /// answer before a connection is opened.
    pub async fn validate(&self, url: &Url) -> DomainResult<()> {
        if !url.username().is_empty() || url.password().is_some() {
            return Err(DomainError::Forbidden);
        }
        let default_port = match url.scheme() {
            "https" => 443,
            "http" if self.permit_http => 80,
            _ => return Err(DomainError::Forbidden),
        };
        let port = url.port().unwrap_or(default_port);
        if !self.allowed_ports.contains(&port) {
            return Err(DomainError::Forbidden);
        }
        match url.host().ok_or(DomainError::Forbidden)? {
            Host::Ipv4(address) => validate_ip(IpAddr::V4(address))?,
            Host::Ipv6(address) => validate_ip(IpAddr::V6(address))?,
            Host::Domain(host) => {
                let host = host.to_ascii_lowercase();
                if !self.allowed_hosts.is_empty() && !self.allowed_hosts.contains(&host) {
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
                for address in addresses {
                    validate_ip(address.ip())?;
                }
            }
        }
        Ok(())
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
}
