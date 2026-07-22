import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const OWNER = {
  organization: 'e2e-shrine',
  email: 'owner@e2e.kitsune.test',
  password: 'correct e2e foxfire battery'
};

async function authenticate(page: Page): Promise<void> {
  await page.goto('/setup');
  const completed = page.getByRole('heading', { name: 'Setup is complete.' });
  await expect(
    page.getByRole('heading', {
      name: /Setup is complete\.|Raise your first torii\./
    })
  ).toBeVisible();
  if (await completed.isVisible()) {
    await page.getByRole('link', { name: 'Go to sign in' }).click();
    await page.getByLabel('Organization').fill(OWNER.organization);
    await page.getByLabel('Email').fill(OWNER.email);
    await page.getByLabel('Password').fill(OWNER.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
  } else {
    await page.getByLabel('Organization name').fill('E2E Shrine');
    await page.getByLabel('Organization key').fill(OWNER.organization);
    await page.getByLabel('Your name').fill('E2E Owner');
    await page.getByLabel('Email').fill(OWNER.email);
    await page.getByLabel('Password').fill(OWNER.password);
    await page.getByRole('button', { name: 'Create Kitsune' }).click();
  }
  await expect(page).not.toHaveURL(/\/login$/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin$/);
}

function projectKey(testInfo: TestInfo): string {
  return testInfo.project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

test('organizer authors a published challenge visible on the player board', async ({
  page
}, testInfo) => {
  await authenticate(page);
  const key = projectKey(testInfo);
  const run = Date.now().toString(36);
  const eventName = `Foxfire E2E ${testInfo.project.name} ${run}`;
  const challengeName = `Trailhead ${testInfo.project.name} ${run}`;

  await page.goto('/admin/events');
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.getByRole('button', { name: 'New event' }).click();
  await expect(page.getByLabel('Event name')).toBeVisible();
  await page.getByLabel('Event name').fill(eventName);
  await page.getByLabel('Event key').fill(`foxfire-e2e-${key}-${run}`);
  await page.getByLabel('Description').fill('A browser-tested Kitsune event.');
  await page.getByLabel('Participation').selectOption('individual');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.locator('.event-grid').getByText(eventName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Go live' }).click();
  await expect(page.getByText('Current state: live')).toBeVisible();

  await page.goto('/admin/challenges');
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByLabel('Authoring event')).toHaveValue(/.+/);
  await page.getByRole('button', { name: 'New challenge' }).click();
  await page.getByLabel('Title').fill(challengeName);
  await page.getByLabel('Description').fill('Follow the typed API trail to the accepted flag.');
  await page.getByLabel('Lifecycle').selectOption('published');
  await page.getByLabel('Accepted answer').fill(`kit{${key}-accepted}`);
  await page.getByRole('button', { name: 'Add hint' }).click();
  await page
    .getByRole('textbox', { name: 'Hint 1', exact: true })
    .fill('The answer follows the project-specific key.');
  await page.getByLabel('Point cost').fill('10');
  await page.getByRole('button', { name: 'Add survey question' }).click();
  await page.getByLabel('Question key').fill('difficulty');
  await page.getByLabel('Prompt').fill('How difficult was this challenge?');
  await page.getByRole('button', { name: 'Save challenge' }).click();
  await expect(page.getByRole('button', { name: 'Save challenge' })).toBeHidden();
  await expect(page.getByText(challengeName, { exact: true })).toBeVisible();

  await page.goto('/challenges');
  const challengeCard = page
    .locator('article.challenge-card')
    .filter({ has: page.getByRole('heading', { name: challengeName }) });
  await expect(challengeCard).toBeVisible();
  await expect(challengeCard.getByText('500 pts')).toBeVisible();
  await challengeCard.getByRole('button', { name: 'Submit flag' }).click();
  await expect(challengeCard.getByRole('button', { name: 'Unlock hint' })).toBeVisible();
  const hintUnlocked = page.waitForResponse((response) =>
    response.url().includes('/hints/1/unlock')
  );
  await challengeCard.getByRole('button', { name: 'Unlock hint' }).click();
  await hintUnlocked;
  await expect(
    challengeCard.getByText('The answer follows the project-specific key.')
  ).toBeVisible();
  await challengeCard.getByLabel('Flag').fill(`kit{${key}-accepted}`);
  const submissionRecorded = page.waitForResponse((response) =>
    response.url().includes('/submissions')
  );
  await challengeCard.getByRole('button', { name: 'Inspect submission' }).click();
  await submissionRecorded;
  await expect(challengeCard.getByText(/First blood\./)).toBeVisible();
  await expect(challengeCard.getByRole('button', { name: 'After the solve' })).toBeVisible();

  await challengeCard
    .getByLabel('Your solution')
    .fill('Trace the endpoint, normalize the path, and inspect the typed response.');
  const writeupSubmitted = page.waitForResponse((response) => response.url().endsWith('/writeup'));
  await challengeCard.getByRole('button', { name: 'Submit for review' }).click();
  await writeupSubmitted;
  await expect(challengeCard.getByText('submitted', { exact: true })).toBeVisible();

  await challengeCard.getByLabel('How difficult was this challenge?').fill('4');
  const surveySubmitted = page.waitForResponse((response) => response.url().endsWith('/survey'));
  await challengeCard.getByRole('button', { name: 'Save survey' }).click();
  await surveySubmitted;
  await expect(challengeCard.getByText('Saved', { exact: true })).toBeVisible();

  const scoreboardLoaded = page.waitForResponse((response) =>
    response.url().endsWith('/scoreboard')
  );
  await page.goto('/scoreboard');
  await scoreboardLoaded;
  const standings = page.getByLabel('Event standings');
  await expect(standings.getByText('E2E Owner', { exact: true })).toBeVisible();
  await expect(standings.getByText('540 pts', { exact: true })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.goto('/admin/reviews');
  const writeupCard = page.locator('article.writeup-card').filter({ hasText: challengeName });
  await expect(writeupCard).toBeVisible();
  await expect(writeupCard.getByText('E2E Owner', { exact: true })).toBeVisible();
  await writeupCard.getByRole('button', { name: 'Approve' }).click();
  await expect(writeupCard.getByText('approved', { exact: true })).toBeVisible();
  await writeupCard.getByRole('button', { name: 'Publish' }).click();
  await expect(writeupCard.getByText('published', { exact: true })).toBeVisible();
  await expect(page.getByText('4.0', { exact: true })).toBeVisible();

  const reviewAccessibility = await new AxeBuilder({ page }).analyze();
  expect(reviewAccessibility.violations).toEqual([]);

  const manualChallengeName = `Proof review ${testInfo.project.name} ${run}`;
  await page.goto('/admin/challenges');
  await page.getByRole('button', { name: 'New challenge' }).click();
  await page.getByLabel('Title').fill(manualChallengeName);
  await page.getByLabel('Description').fill('Explain a bounded reproduction path for review.');
  await page.getByLabel('Type').selectOption('manual_verification');
  await page.getByLabel('Lifecycle').selectOption('published');
  await page.getByRole('button', { name: 'Save challenge' }).click();
  await expect(page.getByText(manualChallengeName, { exact: true })).toBeVisible();

  await page.goto('/challenges');
  const manualCard = page
    .locator('article.challenge-card')
    .filter({ has: page.getByRole('heading', { name: manualChallengeName }) });
  await manualCard.getByRole('button', { name: 'Submit flag' }).click();
  const manualEvidence = 'A browser-verified reproduction with bounded impact and clear evidence.';
  await manualCard.getByLabel('Evidence').fill(manualEvidence);
  await manualCard.getByRole('button', { name: 'Inspect submission' }).click();
  await expect(manualCard.getByText('Queued for an organizer’s review.')).toBeVisible();
  await expect(manualCard.getByRole('button', { name: 'Awaiting review' })).toBeDisabled();

  await page.goto('/admin/reviews');
  const manualReviewCard = page
    .locator('article.manual-card')
    .filter({ hasText: manualChallengeName });
  await expect(manualReviewCard.getByText(manualEvidence, { exact: true })).toBeVisible();
  await manualReviewCard.getByLabel('Reviewer note').fill('Reproduction verified in isolation.');
  await manualReviewCard.getByRole('button', { name: 'Accept and score' }).click();
  await expect(manualReviewCard).toBeHidden();

  await page.goto('/admin/events');
  const freezeUpdated = page.waitForResponse((response) =>
    response.url().includes('/scoreboard-controls')
  );
  await page.getByRole('button', { name: 'Freeze', exact: true }).click();
  await freezeUpdated;
  await expect(page.getByText('Frozen snapshot', { exact: true })).toBeVisible();
  const unfreezeUpdated = page.waitForResponse((response) =>
    response.url().includes('/scoreboard-controls')
  );
  await page.getByRole('button', { name: 'Unfreeze', exact: true }).click();
  await unfreezeUpdated;
  await expect(page.getByText('Live and visible', { exact: true })).toBeVisible();

  const teamsLoaded = page.waitForResponse((response) => response.url().endsWith('/api/v1/teams'));
  await page.goto('/team');
  await teamsLoaded;
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  const createTeam = page.getByRole('button', { name: 'Create team' });
  if (await createTeam.isVisible()) {
    await createTeam.click();
    await page.getByLabel('Team name').fill(`Nine Tails E2E ${run}`);
    await page.locator('form').getByRole('button', { name: 'Create team' }).click();
    await expect(page.locator('form')).toBeHidden();
  }
  await expect(page.locator('.members').getByText('E2E Owner', { exact: true })).toBeVisible();
  await expect(page.getByText('Captain', { exact: true })).toBeVisible();
});
