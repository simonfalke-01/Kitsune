import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const OWNER = {
  displayName: 'E2E Owner',
  email: 'owner@e2e.kitsune.test',
  organization: 'e2e-shrine',
  organizationName: 'E2E Shrine',
  password: 'correct e2e foxfire battery'
};

interface SessionResponse {
  csrf_token: string;
}

interface EventResponse {
  id: string;
}

interface ChallengeResponse {
  id: string;
}

function projectKey(testInfo: TestInfo): string {
  return testInfo.project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

async function authenticate(page: Page): Promise<void> {
  await page.goto('/setup');

  const setupHeading = page.getByRole('heading', {
    name: /Set up Kitsune|Setup complete/
  });
  await expect(setupHeading).toBeVisible();

  if (await page.getByRole('heading', { name: 'Setup complete' }).isVisible()) {
    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await page.getByLabel('Organization').fill(OWNER.organization);
    await page.getByLabel('Email').fill(OWNER.email);
    const password = page.getByRole('textbox', { name: 'Password' });
    await password.fill('temporary value');
    await password.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await password.press('Backspace');
    await password.fill(OWNER.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
  } else {
    await page.getByLabel('Organization name').fill(OWNER.organizationName);
    await page.getByLabel('Organization key').fill(OWNER.organization);
    await page.getByLabel('Your name').fill(OWNER.displayName);
    await page.getByLabel('Email').fill(OWNER.email);
    await page.getByLabel('Password', { exact: true }).fill(OWNER.password);
    await page.getByLabel('Confirm password').fill(OWNER.password);
    await page.getByRole('button', { name: 'Create Kitsune' }).click();
  }

  await expect(page).toHaveURL(/\/challenges$/);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

async function createLiveChallenge(page: Page, testInfo: TestInfo) {
  const sessionResponse = await page.request.get('/api/v1/auth/session');
  expect(sessionResponse.status()).toBe(200);
  const session = (await sessionResponse.json()) as SessionResponse;
  const requestHeaders = {
    'x-csrf-token': session.csrf_token
  };
  const key = projectKey(testInfo);
  const run = Date.now().toString(36);
  const eventName = 'Foxfire Invitational';
  const challengeName = key === 'chromium' ? 'Echo Chamber' : 'Pocket Relay';
  const flag = `kit{${key}-${run}}`;
  const eventResponse = await page.request.post('/api/v1/events', {
    data: {
      description: 'A compact live Jeopardy event.',
      ends_at: null,
      modes: ['jeopardy'],
      name: eventName,
      participation: 'individual',
      slug: `foxfire-${key}-${run}`,
      starts_at: null,
      state: 'draft',
      team_size_limit: null
    },
    headers: requestHeaders
  });
  expect(eventResponse.status()).toBe(201);
  const event = (await eventResponse.json()) as EventResponse;
  const liveResponse = await page.request.patch(`/api/v1/events/${event.id}/state`, {
    data: {
      state: 'live'
    },
    headers: requestHeaders
  });
  expect(liveResponse.status()).toBe(200);
  const challengeResponse = await page.request.post(`/api/v1/events/${event.id}/challenges`, {
    data: {
      answers: [
        {
          case_insensitive: false,
          kind: 'exact',
          value: flag
        }
      ],
      category: 'Web',
      description:
        'A forgotten relay is repeating more than it should. Recover the flag from its response.',
      hints: [],
      kind: {
        type: 'static_flag'
      },
      max_attempts: 5,
      name: challengeName,
      position: 0,
      scoring: {
        kind: 'static',
        points: 500
      },
      state: 'published',
      survey: [],
      tags: [],
      visibility: {
        division_ids: [],
        prerequisites: [],
        visible_from: null,
        visible_until: null
      },
      writeups_enabled: true
    },
    headers: requestHeaders
  });
  expect(challengeResponse.status()).toBe(201);
  const challenge = (await challengeResponse.json()) as ChallengeResponse;

  return {
    challengeId: challenge.id,
    challengeName,
    eventId: event.id,
    flag
  };
}

test('operator setup and competitor challenge submission work end to end', async ({
  page
}, testInfo) => {
  await authenticate(page);
  const created = await createLiveChallenge(page, testInfo);

  await page.context().addCookies([
    {
      name: 'kitsune.selected-event',
      url: new URL(page.url()).origin,
      value: created.eventId
    }
  ]);
  await page.evaluate(() => {
    window.localStorage.setItem('kitsune.theme', 'light');
  });
  await page.goto('/challenges');

  const challengeRow = page.getByRole('link', {
    name: new RegExp(created.challengeName)
  });
  await expect(challengeRow).toBeVisible();
  await expect(challengeRow.getByText('500 pts')).toBeVisible();
  await challengeRow.click();
  await expect(page).toHaveURL(new RegExp(`challenge=${created.challengeId}`));

  if (testInfo.project.name === 'chromium') {
    const splitter = page.getByRole('slider', {
      name: 'Challenge list width'
    });
    await expect(splitter).toHaveValue('38');
    const splitterThumb = page.locator('.kitsune-split-thumb');
    const splitterBox = await splitterThumb.boundingBox();
    expect(splitterBox).not.toBeNull();
    await page.mouse.move(
      splitterBox!.x + splitterBox!.width / 2,
      splitterBox!.y + splitterBox!.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      splitterBox!.x + splitterBox!.width,
      splitterBox!.y + splitterBox!.height / 2
    );
    await page.mouse.up();
    await expect.poll(async () => Number(await splitter.inputValue())).toBeGreaterThan(38);
    await splitter.press('ArrowRight');
    await expect(page.getByRole('heading', { name: created.challengeName })).toBeVisible();
  } else {
    await expect(page.getByRole('dialog', { name: created.challengeName })).toBeVisible();
  }

  const detailSurface = page.locator('article.kitsune-challenge-detail:visible');
  await detailSurface.getByLabel('Flag').fill(created.flag);
  await detailSurface.getByRole('button', { name: 'Submit flag' }).click();

  await expect(page.getByText('Challenge solved')).toBeVisible();
  await expect(challengeRow.getByText('Solved')).toBeVisible();
  await expect(detailSurface.getByText('Solved', { exact: true }).first()).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  if (testInfo.project.name !== 'chromium') {
    const mobileDialog = page.getByRole('dialog', { name: created.challengeName });
    await mobileDialog.focus();
    await page.keyboard.press('Escape');
    await expect(mobileDialog).toBeHidden();
    await expect(page).not.toHaveURL(/challenge=/);
    await expect(challengeRow).toBeFocused();
  }

  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.waitForTimeout(300);

  const darkAccessibility = await new AxeBuilder({ page }).analyze();
  expect(darkAccessibility.violations).toEqual([]);
});

test('toast feedback enters with motion and remains accessible', async ({ page }) => {
  await page.goto('/_kitchen');
  await page.getByRole('button', { name: 'Show success toast' }).first().click();

  const toast = page.locator('.kitsune-toast').filter({ hasText: 'Event published' });
  await expect(toast).toBeVisible();
  await expect
    .poll(async () => {
      return toast.evaluate((element) => getComputedStyle(element).animationName);
    })
    .toBe('kitsune-toast-in');

  const accessibility = await new AxeBuilder({ page }).include('.kitsune-toast').analyze();
  expect(accessibility.violations).toEqual([]);
});
