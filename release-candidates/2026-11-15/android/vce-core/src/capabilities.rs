//! Operating-profile requirements shared by platform shells.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Intelligence {
    #[default]
    Simple,
    Smart,
    Intelligent,
}

/// Senior Assistant is independent of the selected intelligence level.
#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
pub struct Profile {
    pub intelligence: Intelligence,
    pub senior_assistant: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Resource {
    CoreStarter,
    SmartConversation,
    AdvancedIntelligence,
    SeniorAssistance,
}

#[derive(Debug, Serialize)]
pub struct ProfilePlan {
    pub bundled: [Resource; 1],
    pub optional: Vec<Resource>,
    pub manual_emergency_help: bool,
}

impl Profile {
    /// Describes the profile. Native readiness and consent are evaluated before activation.
    pub fn plan(self) -> ProfilePlan {
        let mut optional = Vec::new();
        match self.intelligence {
            Intelligence::Simple => {}
            Intelligence::Smart => optional.push(Resource::SmartConversation),
            Intelligence::Intelligent => optional.push(Resource::AdvancedIntelligence),
        }
        if self.senior_assistant {
            optional.push(Resource::SeniorAssistance);
        }
        ProfilePlan {
            bundled: [Resource::CoreStarter],
            optional,
            manual_emergency_help: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simple_starts_with_bundled_resources_only() {
        let plan = Profile::default().plan();
        assert_eq!(plan.bundled, [Resource::CoreStarter]);
        assert!(plan.optional.is_empty());
        assert!(plan.manual_emergency_help);
    }

    #[test]
    fn senior_assistant_preserves_intelligence_and_emergency_access() {
        for (intelligence, resource) in [
            (Intelligence::Smart, Resource::SmartConversation),
            (Intelligence::Intelligent, Resource::AdvancedIntelligence),
        ] {
            let plan = Profile {
                intelligence,
                senior_assistant: true,
            }
            .plan();
            assert_eq!(plan.optional, [resource, Resource::SeniorAssistance]);
            assert!(plan.manual_emergency_help);
        }
    }
}
