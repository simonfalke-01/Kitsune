//! Profile defaults and independent feature switches.

use serde::{Deserialize, Serialize};

/// Runtime profile only establishes defaults; explicit switches always win.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeProfile {
    /// Zero-configuration single-node experience.
    #[default]
    Lean,
    /// Scale and advanced capabilities enabled where locally available.
    Full,
}

/// Independently configurable product capabilities.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct FeatureFlags {
    /// Jeopardy mode.
    pub jeopardy: bool,
    /// King of the Hill mode.
    pub koth: bool,
    /// Attack/Defense mode.
    pub attack_defense: bool,
    /// Workshop mode.
    pub workshop: bool,
    /// Dynamic container instances.
    pub orchestration: bool,
    /// Automation authoring and execution.
    pub automation: bool,
    /// External identity providers.
    pub external_auth: bool,
    /// Plugin registry browsing.
    pub marketplace: bool,
    /// Local and registry-installed Component Model plugins.
    pub plugins: bool,
    /// Discord integration.
    pub discord: bool,
    /// SMTP channel.
    pub smtp: bool,
    /// S3-compatible object storage.
    pub s3: bool,
}

impl FeatureFlags {
    /// Defaults for a profile.
    pub fn for_profile(profile: RuntimeProfile) -> Self {
        match profile {
            RuntimeProfile::Lean => Self::default(),
            RuntimeProfile::Full => Self {
                jeopardy: true,
                koth: true,
                attack_defense: true,
                workshop: true,
                orchestration: true,
                automation: true,
                external_auth: true,
                marketplace: true,
                plugins: true,
                discord: true,
                smtp: true,
                s3: true,
            },
        }
    }
}

impl Default for FeatureFlags {
    fn default() -> Self {
        Self {
            jeopardy: true,
            koth: false,
            attack_defense: false,
            workshop: false,
            orchestration: false,
            automation: false,
            external_auth: false,
            marketplace: false,
            plugins: false,
            discord: false,
            smtp: false,
            s3: false,
        }
    }
}

/// Copy tone. Mascot visibility is intentionally independent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum VoiceTone {
    /// Warm, clever Kitsune copy.
    #[default]
    Kitsune,
    /// Plain professional wording.
    Professional,
}

/// Commercially granted convenience capabilities.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct Entitlements {
    /// Supported custom-logo/theme path and removal of the support nudge.
    pub white_label: bool,
}

/// Branding behavior. Disabling it is deliberately free.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct BrandingConfig {
    /// Show Kitsune identity and mascot delight moments.
    pub enabled: bool,
    /// Copy tone, independent from identity.
    pub tone: VoiceTone,
    /// Optional custom logo, honored only in the supported white-label UX.
    pub custom_logo_url: Option<String>,
}

impl Default for BrandingConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            tone: VoiceTone::Kitsune,
            custom_logo_url: None,
        }
    }
}

impl BrandingConfig {
    /// Whether to show the friendly project-support request next to de-branding.
    pub fn show_support_nudge(&self, entitlements: &Entitlements) -> bool {
        !self.enabled && !entitlements.white_label
    }

    /// Returns a custom identity only through the supported entitlement path.
    pub fn effective_custom_logo<'a>(&'a self, entitlements: &Entitlements) -> Option<&'a str> {
        entitlements
            .white_label
            .then_some(self.custom_logo_url.as_deref())
            .flatten()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debranding_is_free_but_nudged_without_entitlement() {
        let branding = BrandingConfig {
            enabled: false,
            ..BrandingConfig::default()
        };
        assert!(branding.show_support_nudge(&Entitlements::default()));
        assert!(!branding.show_support_nudge(&Entitlements { white_label: true }));
    }
}
