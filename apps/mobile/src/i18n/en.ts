/**
 * English UI strings.
 *
 * Every string a user can read lives in a translation file, never inline in a
 * component. `en` defines the set of keys; `ar` must provide every one of them
 * (the type enforces it, and `translations.spec.ts` checks it again at runtime).
 *
 * Error messages (`error.*`) are what a visitor sees when something fails. They
 * deliberately avoid technical words (server, request, network, API, timeout):
 * the cause is for the logs, not for the person standing at a table.
 *
 * Placeholders are written `{name}` and must appear in every language.
 */
export const en = {
  'common.retry': 'Try again',
  'common.loading': 'Loading…',
  'common.wait': 'Please wait',

  'state.loading': 'Loading',

  'errorState.title': 'Something went wrong',

  'error.generic': 'Something went wrong. Please try again.',
  'error.connection': 'We could not connect. Check your internet connection and try again.',
  'error.slow': 'This is taking longer than expected. Please try again.',
  'error.unexpected': 'Something went wrong on our side. Please try again in a moment.',
  'error.unavailable': 'The service is temporarily unavailable. Please try again soon.',
  'error.invalidInput': 'That does not look right. Please check it and try again.',
  'error.notFound': 'We could not find what you were looking for.',
  'error.tableNotFound': 'We could not find this table. Check the code and try again.',
  'error.designNotFound': 'This design is no longer available.',
  'error.jobNotFound': 'This drawing is no longer available. Please start again.',
  'error.tableDisabled': 'This table is switched off right now.',
  'error.tableOffline': 'This table cannot be reached right now. Please try again later.',
  'error.tableBusy': 'This table is already drawing. Please wait for it to finish.',
  'error.notAllowedNow': 'That is not possible right now. The drawing may have just changed.',

  'mode.simulation': 'Simulation',
  'mode.hardware': 'Real table',
  'mode.unknown': 'Unknown mode',

  'language.title': 'Language',
  'language.en': 'English',
  'language.ar': 'العربية',
  'language.restartRequired': 'Close and reopen the app to finish changing the language.',

  'designPreview.label': 'Design preview',
  'designPreview.labelWithProgress': 'Design preview, {percent} drawn',

  'home.tagline':
    'An art table whose sand drawings keep changing, made to become the heart of a room.',
  'home.scan': 'Scan your table',
  'home.enterCode': 'Enter the link instead',
  'home.diagnostics': 'Connection details',

  'code.label': 'Link from your table',
  'code.placeholder': 'Paste the link that came with your table',
  'code.submit': 'Connect my table',
  'code.invalid': 'That is not the link made for your table. Check it and try again.',

  'scan.title': 'Scan the QR code on your table',
  'scan.hint': 'Point the camera at the code on the table.',
  'scan.unrecognised':
    'That is not the code made for your table. Scan the QR code that came with it.',
  'scan.permission.title': 'Camera access',
  'scan.permission.explain':
    'ATHAR uses the camera only to read the QR code on your table. Nothing is recorded or saved.',
  'scan.permission.allow': 'Allow camera',
  'scan.permission.denied':
    'Camera access is off. You can turn it on in your settings, or enter the table code instead.',
  'scan.permission.settings': 'Open settings',
  'scan.enterInstead': 'Enter the link instead',

  'table.status': 'Status',
  'table.connection.online': 'Ready to draw',
  'table.connection.offline': 'Offline',
  'table.connection.busy': 'Drawing now',
  'table.connection.error': 'Not working',
  'table.connection.disabled': 'Switched off',
  'table.designsTitle': 'Choose a design',
  'table.scanAnother': 'Scan another code',
  'table.unknown.title': 'Table not found',
  'table.disabled.title': 'This table is switched off',
  'table.disabled.body': 'It is not taking new drawings right now. Please try again later.',
  'table.offline.title': 'This table is offline',
  'table.offline.body': 'It cannot be reached right now. Please try again in a moment.',
  'table.busy.title': 'This table is drawing',
  'table.busy.body':
    'Someone is already drawing here. You can watch it, or come back when it has finished.',
  'table.shape.round': 'Round table, {diameter} mm across',
  'table.shape.square': 'Square table, {side} mm',
  'table.shape.rectangle': 'Rectangular table, {width} × {height} mm',
  'table.shape.oval': 'Oval table, {width} × {height} mm',
  'table.watch': 'Watch the drawing',

  'duration.minutes': 'About {value} min',
  'duration.seconds': 'About {value} sec',

  'design.inspiration.traditional': 'Traditional inspiration',
  'design.inspiration.modern': 'Modern interpretation',
  'design.sources': 'Sources',
  'design.estimated': 'Estimated time',
  'design.start': 'Start drawing',
  'design.watchRunning': 'Watch the running drawing',

  'job.state.queued': 'Getting ready',
  'job.state.drawing': 'Drawing',
  'job.state.paused': 'Paused',
  'job.state.completed': 'Finished',
  'job.state.failed': 'Stopped by a problem',
  'job.state.cancelled': 'Stopped',
  'job.percentDone': '{percent} done',
  'job.pause': 'Pause',
  'job.resume': 'Resume',
  'job.stop': 'Stop',
  'job.stop.confirmTitle': 'Stop this drawing?',
  'job.stop.confirmBody': 'What has been drawn so far will stay as it is.',
  'job.stop.confirm': 'Stop drawing',
  'job.stop.keep': 'Keep drawing',
  'job.reconnecting': 'Connection lost. Trying again…',
  'job.gone.title': 'This drawing is no longer available',
  'job.backToTable': 'Back to the table',

  'job.error.OFFLINE': 'The table went offline.',
  'job.error.BUSY': 'The table was busy with something else.',
  'job.error.TRAJECTORY_REJECTED': 'The table could not draw this design.',
  'job.error.FAULT': 'The table reported a problem while drawing.',
  'job.error.SIMULATED_FAULT': 'A simulated problem was introduced for testing.',
  'job.error.unknown': 'Something went wrong while drawing.',

  'result.title.completed.simulation': 'Simulated drawing completed',
  'result.title.completed.hardware': 'Drawing completed',
  'result.title.completed.unknown': 'Drawing completed',
  'result.title.failed.simulation': 'The simulated drawing could not be finished',
  'result.title.failed.hardware': 'The drawing could not be finished',
  'result.title.failed.unknown': 'The drawing could not be finished',
  'result.title.cancelled.simulation': 'The simulated drawing was stopped',
  'result.title.cancelled.hardware': 'The drawing was stopped',
  'result.title.cancelled.unknown': 'The drawing was stopped',
  'result.body.completed.simulation': 'This was a simulation. Nothing was drawn on a real table.',
  'result.body.completed.hardware': 'Your pattern is ready in the sand.',
  'result.body.completed.unknown': 'The drawing has finished.',
  'result.body.cancelled.simulation': 'You stopped the simulation.',
  'result.body.cancelled.hardware': 'What was drawn so far stays as it is.',
  'result.body.cancelled.unknown': 'The drawing was stopped before it finished.',
  'result.drawAgain': 'Draw again',

  'diagnostics.readiness': 'Readiness',
  'diagnostics.ready': 'Ready',
  'diagnostics.notReady': 'Not ready',
  'diagnostics.tableMode': 'Table mode',
  'diagnostics.checks': 'Checks',

  'error.pairingTokenInvalid':
    'This code is no longer valid. Ask the table owner for a new invitation.',
  'error.pairingWrongAccount':
    'This code was made for a different account. Sign in with the account it was made for.',
  'error.tableAlreadyClaimed':
    'This table already belongs to someone else. Ask its owner to invite you.',
  'error.invalidCredentials': 'The email or password is not right.',
  'error.activationInvalid': 'That activation code is not valid, or it has already been used.',
  'error.tooManyAttempts': 'Too many attempts. Please wait a moment and try again.',
  'error.sessionExpired': 'Your session has ended. Please sign in again.',
  'error.notAllowed': 'You are not allowed to do that on this table.',
  'error.lightNotIncluded': 'Your table does not include coloured light.',
  'error.reconnect': 'The connection to the table lapsed. Please try again.',
  'signIn.title': 'Welcome to *ATHAR*',
  'signIn.email': 'Email',
  'signIn.password': 'Password',
  'signIn.submit': 'Sign in',
  'signIn.haveCode': 'I have an activation code',
  'signIn.code': 'Activation code',
  'signIn.newPassword': 'Choose a password (10 characters or more)',
  'signIn.activate': 'Activate my account',
  'signIn.haveAccount': 'I already have an account',
  'home.signOut': 'Sign out',
  'pair.working': 'Connecting you to your table…',
  'pair.failed': 'We could not connect you to this table',
  'light.title': 'Light',
  'light.off': 'Off',
  'light.on': 'On',
  'light.hexLabel': 'Colour code',
  'light.hexInvalid': 'Use a colour code like #ff8800.',
  'light.brightness': 'Brightness: {percent}',
  'light.dimmer': 'Dimmer',
  'light.brighter': 'Brighter',
  'light.failed': 'The light could not be changed',
  'share.title': 'Invite someone',
  'share.body': 'Create a link that lets one person use this table for 24 hours.',
  'share.create': 'Create an invitation',
  'share.send': 'Send the invitation again',
  'share.message': 'Join my ATHAR table: {link}',
  'share.failed': 'The invitation could not be created',

  'tabs.home': 'Home',
  'tabs.scan': 'Scan',
  'tabs.account': 'Account',

  'home.greeting': 'Welcome back',
  'home.heroTitle': 'Art in motion, a trace that *endures*.',
  'home.recent': 'Pick up where you left off',
  'home.recentOpen': 'Open this table',

  'account.title': 'Your *account*',
  'account.role.admin': 'Administrator',
  'account.role.customer': 'Customer',
  'account.appearance': 'Appearance',
  'account.theme.system': 'Automatic',
  'account.theme.light': 'Light',
  'account.theme.dark': 'Dark',

  'signIn.subtitle': 'Sign in to control your sand table.',
  'signIn.tab.signIn': 'Sign in',
  'signIn.tab.activate': 'Activate',
  'signIn.showPassword': 'Show password',
  'signIn.hidePassword': 'Hide password',

  'table.lightAndShare': 'Light and sharing',
  'table.designsCount': '{count} designs',
} as const;

export type TranslationKey = keyof typeof en;
