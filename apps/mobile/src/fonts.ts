/**
 * The bundled fonts, registered under the names in `theme.ts` (`fontFamily`).
 *
 * Each weight is imported from its own sub-path so only the four weights the
 * app uses are bundled, not all seven in the package. IBM Plex Sans Arabic is
 * licensed under the SIL Open Font License 1.1; the licence text ships in
 * `@expo-google-fonts/ibm-plex-sans-arabic/LICENSE_FONT` and is reproduced in
 * `assets/fonts/OFL.txt`.
 */

import { IBMPlexSansArabic_400Regular } from '@expo-google-fonts/ibm-plex-sans-arabic/400Regular';
import { IBMPlexSansArabic_500Medium } from '@expo-google-fonts/ibm-plex-sans-arabic/500Medium';
import { IBMPlexSansArabic_600SemiBold } from '@expo-google-fonts/ibm-plex-sans-arabic/600SemiBold';
import { IBMPlexSansArabic_700Bold } from '@expo-google-fonts/ibm-plex-sans-arabic/700Bold';
import { fontFamily } from './theme';

export const fontSources = {
  [fontFamily.regular]: IBMPlexSansArabic_400Regular,
  [fontFamily.medium]: IBMPlexSansArabic_500Medium,
  [fontFamily.semibold]: IBMPlexSansArabic_600SemiBold,
  [fontFamily.bold]: IBMPlexSansArabic_700Bold,
};
