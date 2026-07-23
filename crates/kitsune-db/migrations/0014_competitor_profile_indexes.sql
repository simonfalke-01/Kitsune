-- Keep competitor activity projections bounded as event history grows.
CREATE INDEX challenge_solves_user_profile_idx
    ON challenge_solves (user_id, solved_at DESC, challenge_id)
    WHERE user_id IS NOT NULL;

CREATE INDEX challenge_solves_team_profile_idx
    ON challenge_solves (team_id, solved_at DESC, challenge_id)
    WHERE team_id IS NOT NULL;
