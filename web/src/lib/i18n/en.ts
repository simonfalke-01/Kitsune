export type Tone = 'kitsune' | 'professional';

export const en = {
  brand: { name: 'Kitsune' },
  nav: {
    home: 'Home',
    challenges: 'Challenges',
    scoreboard: 'Scoreboard',
    team: 'Team',
    admin: 'Admin'
  },
  auth: {
    welcome: {
      kitsune: 'The gate is open.',
      professional: 'Welcome back.'
    },
    intro: {
      kitsune: 'Sign in, follow the foxfire, and outfox the next challenge.',
      professional: 'Sign in to continue to your event.'
    },
    submit: 'Sign in',
    setupTitle: {
      kitsune: 'Raise your first torii.',
      professional: 'Set up your organization.'
    }
  },
  empty: {
    challenges: {
      kitsune: 'Kon sniffed around. No challenges have crossed the gate yet.',
      professional: 'No challenges are available yet.'
    },
    event: {
      kitsune: 'A quiet shrine—for now. Create an event when you are ready.',
      professional: 'No event is configured yet.'
    }
  },
  branding: {
    nudge:
      'Kon’s happy here—but if you’re running Kitsune unbranded, please consider supporting the project so it keeps getting better 🦊'
  }
} as const;
