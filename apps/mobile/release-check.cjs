/**
 * Refuses to build a distributable app that points at the wrong place.
 *
 * `app.config.ts` runs this for EAS `preview` and `production` builds (the build
 * profile name arrives as `EAS_BUILD_PROFILE`). The `development` profile and
 * plain `expo start` are not checked: they point at a developer's machine on
 * purpose.
 *
 * Plain CommonJS, not TypeScript, because Expo loads `app.config.ts` through a
 * loader that cannot import other TypeScript files. Pure, and tested in Node by
 * `src/config/release-check.spec.ts`; it reads nothing itself, the caller passes
 * the environment.
 */

/** Profiles whose output leaves the developer's machine. */
const CHECKED_PROFILES = ['preview', 'production'];

/**
 * Hosts that mean "not a real server": placeholders (the reserved `.example`
 * and `.test` / `.invalid` / `.localhost` names) and addresses that only work on
 * a developer's own network.
 */
/** @param {string} host */
function isPlaceholderOrLocal(host) {
  const name = host.toLowerCase();

  return (
    /\.(example|test|invalid|localhost)$/.test(name) ||
    name === 'localhost' ||
    name === '10.0.2.2' ||
    /^127\./.test(name) ||
    /^10\./.test(name) ||
    /^192\.168\./.test(name) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(name)
  );
}

/**
 * What is wrong with the release configuration. Empty means it can be built.
 *
 * @param {string | undefined} profile
 * @param {{ EXPO_PUBLIC_API_BASE_URL?: string, EXPO_PUBLIC_TABLE_LINK_HOSTS?: string }} environment
 * @returns {string[]}
 */
function checkReleaseConfig(profile, environment) {
  if (profile === undefined || !CHECKED_PROFILES.includes(profile)) {
    return [];
  }

  const problems = [];
  const baseUrl = environment.EXPO_PUBLIC_API_BASE_URL?.trim() ?? '';

  if (baseUrl === '') {
    problems.push(
      'EXPO_PUBLIC_API_BASE_URL is not set. Without it the app falls back to a developer address.',
    );
  } else {
    let url;

    try {
      url = new URL(baseUrl);
    } catch {
      problems.push(`EXPO_PUBLIC_API_BASE_URL "${baseUrl}" is not a URL.`);
    }

    if (url !== undefined) {
      if (url.protocol !== 'https:') {
        problems.push(
          `EXPO_PUBLIC_API_BASE_URL must use https in a ${profile} build (it is ${url.protocol}//). ` +
            'Plain http is allowed only in development builds.',
        );
      }

      if (isPlaceholderOrLocal(url.hostname)) {
        problems.push(
          `EXPO_PUBLIC_API_BASE_URL points at "${url.hostname}", a placeholder or a local address. ` +
            'Set the real API host.',
        );
      }
    }
  }

  const hosts = (environment.EXPO_PUBLIC_TABLE_LINK_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter((host) => host !== '');

  for (const host of hosts) {
    if (isPlaceholderOrLocal(host)) {
      problems.push(
        `EXPO_PUBLIC_TABLE_LINK_HOSTS contains "${host}", a placeholder or a local address. ` +
          'Set the real link host, or leave the list empty until the domain is decided.',
      );
    }
  }

  return problems;
}

/**
 * Throws one readable error listing every problem.
 *
 * @param {string | undefined} profile
 * @param {{ EXPO_PUBLIC_API_BASE_URL?: string, EXPO_PUBLIC_TABLE_LINK_HOSTS?: string }} environment
 */
function assertReleaseConfig(profile, environment) {
  const problems = checkReleaseConfig(profile, environment);

  if (problems.length > 0) {
    throw new Error(
      `The "${profile}" build profile is not ready to build:\n${problems
        .map((problem) => `  - ${problem}`)
        .join('\n')}\nSee docs/deployment.md.`,
    );
  }
}

module.exports = { checkReleaseConfig, assertReleaseConfig };
