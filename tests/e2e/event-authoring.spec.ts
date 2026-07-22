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
    const authenticated = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().endsWith('/api/v1/auth/login')
    );
    await page.getByRole('button', { name: 'Sign in' }).click();
    expect((await authenticated).ok()).toBe(true);
  } else {
    await page.getByLabel('Organization name').fill('E2E Shrine');
    await page.getByLabel('Organization key').fill(OWNER.organization);
    await page.getByLabel('Your name').fill('E2E Owner');
    await page.getByLabel('Email').fill(OWNER.email);
    await page.getByLabel('Password').fill(OWNER.password);
    const authenticated = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().endsWith('/api/v1/setup')
    );
    await page.getByRole('button', { name: 'Create Kitsune' }).click();
    expect((await authenticated).ok()).toBe(true);
  }
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
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
  const scoreHistoryLoaded = page.waitForResponse((response) =>
    response.url().endsWith('/score-history')
  );
  await page.goto('/scoreboard');
  await Promise.all([scoreboardLoaded, scoreHistoryLoaded]);
  await expect(page.getByLabel('Score history')).toBeVisible();
  await expect(page.getByText('Score trail', { exact: true })).toBeVisible();
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
  const manualChallengeCreated = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/challenges')
  );
  await page.getByRole('button', { name: 'Save challenge' }).click();
  await manualChallengeCreated;
  await expect(page.getByRole('button', { name: 'Save challenge' })).toBeHidden();
  await expect(page.getByText(manualChallengeName, { exact: true })).toBeVisible();

  const challengesReloaded = page.waitForResponse(
    (response) => response.request().method() === 'GET' && response.url().endsWith('/challenges')
  );
  await page.goto('/challenges');
  await challengesReloaded;
  const manualCard = page
    .locator('article.challenge-card')
    .filter({ has: page.getByRole('heading', { name: manualChallengeName }) });
  await expect(manualCard).toBeVisible();
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

  const tokenName = `Challenge reader ${testInfo.project.name} ${run}`;
  await page.goto('/account/security');
  await expect(page.getByRole('heading', { name: 'Guard your trail.' })).toBeVisible();
  const apiTokenManager = page.locator('.card').filter({
    has: page.getByRole('heading', { name: 'API tokens' })
  });
  await apiTokenManager.getByLabel('Token name').fill(tokenName);
  await apiTokenManager.getByRole('checkbox', { name: 'challenge read', exact: true }).check();
  await apiTokenManager.getByRole('checkbox', { name: eventName, exact: true }).check();
  const tokenCreated = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().endsWith('/api/v1/auth/tokens')
  );
  await apiTokenManager.getByRole('button', { name: 'Create API token' }).click();
  expect((await tokenCreated).status()).toBe(201);
  await expect(page.getByLabel('New API token')).toHaveValue(/v4\.local\./);
  const tokenCard = page.locator('.tokens article').filter({ hasText: tokenName });
  await expect(tokenCard.getByText('Active', { exact: true })).toBeVisible();

  const oauthName = `Score exporter ${testInfo.project.name} ${run}`;
  const oauthManager = page.locator('.card').filter({
    has: page.getByRole('heading', { name: 'OAuth2 clients' })
  });
  await oauthManager.getByLabel('Client name').fill(oauthName);
  await oauthManager.getByRole('checkbox', { name: 'challenge read', exact: true }).check();
  await oauthManager.getByRole('checkbox', { name: eventName, exact: true }).check();
  const oauthCreated = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith('/api/v1/auth/oauth-clients')
  );
  await oauthManager.getByRole('button', { name: 'Create OAuth client' }).click();
  expect((await oauthCreated).status()).toBe(201);

  const clientId = await oauthManager.getByLabel('New OAuth client ID').inputValue();
  const clientSecret = await oauthManager.getByLabel('New OAuth client secret').inputValue();
  expect(clientId).toMatch(/^kitc_/);
  expect(clientSecret).toMatch(/^kits_/);

  const tokenExchange = await page.request.post('/oauth/token', {
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
    },
    form: {
      grant_type: 'client_credentials',
      scope: 'challenge_read'
    }
  });
  expect(tokenExchange.status()).toBe(200);
  expect(tokenExchange.headers()['cache-control']).toBe('no-store');
  const oauthToken = (await tokenExchange.json()) as {
    access_token: string;
    expires_in: number;
    scope: string;
  };
  expect(oauthToken.access_token).toMatch(/v4\.local\./);
  expect(oauthToken.expires_in).toBe(900);
  expect(oauthToken.scope).toBe('challenge_read');

  const eventId = await page.evaluate(() => localStorage.getItem('kitsune.selected-event'));
  expect(eventId).toBeTruthy();
  const authorizedChallenges = await page.request.get(`/api/v1/events/${eventId}/challenges`, {
    headers: { authorization: `Bearer ${oauthToken.access_token}` }
  });
  expect(authorizedChallenges.status()).toBe(200);
  const organizationEvents = await page.request.get('/api/v1/events', {
    headers: { authorization: `Bearer ${oauthToken.access_token}` }
  });
  expect(organizationEvents.status()).toBe(403);

  const oauthCard = page.locator('.clients article').filter({ hasText: oauthName });
  await expect(oauthCard.getByText('Active', { exact: true })).toBeVisible();

  const securityAccessibility = await new AxeBuilder({ page }).analyze();
  expect(securityAccessibility.violations).toEqual([]);

  const oauthRevoked = page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' &&
      response.url().includes('/api/v1/auth/oauth-clients/')
  );
  await oauthCard.getByRole('button', { name: `Revoke ${oauthName}` }).click();
  expect((await oauthRevoked).status()).toBe(204);
  await expect(oauthCard.getByText('Revoked', { exact: true })).toBeVisible();
  const revokedAccess = await page.request.get(`/api/v1/events/${eventId}/challenges`, {
    headers: { authorization: `Bearer ${oauthToken.access_token}` }
  });
  expect(revokedAccess.status()).toBe(401);

  const tokenRevoked = page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' && response.url().includes('/api/v1/auth/tokens/')
  );
  await tokenCard.getByRole('button', { name: `Revoke ${tokenName}` }).click();
  expect((await tokenRevoked).status()).toBe(204);
  await expect(tokenCard.getByText('Revoked', { exact: true })).toBeVisible();
});
