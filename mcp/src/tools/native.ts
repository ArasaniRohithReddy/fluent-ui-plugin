import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadJson, textResult } from '../util.js';

type PlatformId = 'ios' | 'android' | 'windows';

interface NativePlatform {
  label?: string;
  repo?: string;
  generationStory?: string;
  maintenanceWarning?: string;
  sourceBranches?: string;
  frameworkKinds?: Array<{ kind: string; meaning?: string }>;
  criticalNotes?: string[];
  generations?: unknown;
  install?: unknown;
  components?: Record<string, unknown>;
  tokens?: unknown;
  theming?: unknown;
  typography?: unknown;
  typographyNotes?: unknown;
  color?: unknown;
  materials?: unknown;
  controlGaps?: unknown;
  frameworkChoice?: unknown;
  accessibility?: unknown;
}

interface NativeData {
  meta?: Record<string, unknown>;
  platforms?: Record<string, NativePlatform>;
  crossPlatform?: unknown;
  siteRoutes?: unknown;
  siteRouteNotes?: unknown;
  unverified?: Array<{ platform?: string; note?: string }>;
}

const load = (): NativeData | null => loadJson<NativeData>('fluent-native.json');

const PLATFORM_LABEL: Record<PlatformId, string> = {
  ios: 'iOS (fluentui-apple)',
  android: 'Android (fluentui-android)',
  windows: 'Windows (WinUI 3 / WinUI 2 / WPF)',
};

/** Case-insensitive exact match, so `toggleswitch` still resolves to `ToggleSwitch`. */
function resolveName(name: string, pool: Record<string, unknown> | undefined): string | null {
  if (!pool) return null;
  const lower = name.toLowerCase();
  for (const key of Object.keys(pool)) {
    if (key.toLowerCase() === lower) return key;
  }
  return null;
}

/** Substring match in both directions, so `progress` offers ProgressBar and ProgressRing. */
function nearMatches(name: string, pool: Record<string, unknown> | undefined): string[] {
  if (!pool) return [];
  const lower = name.toLowerCase();
  return Object.keys(pool)
    .filter((k) => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase()))
    .slice(0, 10);
}

/** Only the unverified notes that belong to this platform, so callers see the caveats that apply. */
function unverifiedFor(data: NativeData, platform: PlatformId): string[] {
  return (data.unverified ?? [])
    .filter((u) => u.platform === platform)
    .map((u) => u.note ?? '')
    .filter(Boolean);
}

export function registerNative(server: McpServer): void {
  server.registerTool(
    'fluent_native_component',
    {
      title: 'Fluent 2 native component lookup — iOS, Android, Windows',
      description:
        'Look up a Fluent 2 component on a NATIVE platform and get what is needed to write code that compiles: the real type name, which framework kind it belongs to (iOS uikit vs swiftui, Android view vs compose, Windows winui3 vs winui2 vs wpf), the exact import or namespace, key API/parameters, a short sample, and accessibility notes. Use before writing any Swift, Kotlin or XAML Fluent UI code — the same component name often means different types on different platforms.',
      inputSchema: {
        platform: z
          .enum(['ios', 'android', 'windows'])
          .describe('Native platform: "ios" (fluentui-apple), "android" (fluentui-android) or "windows" (WinUI 3 / WinUI 2 / WPF).'),
        name: z
          .string()
          .describe('The component or type name, e.g. "Avatar", "ToggleSwitch", "NavigationView", "FluentTextField".'),
      },
    },
    async ({ platform, name }) => {
      const data = load();
      if (!data) return textResult('Fluent native dataset not found at mcp/data/fluent-native.json.');

      const plat = data.platforms?.[platform];
      if (!plat) return textResult(`Platform "${platform}" is not present in the Fluent native dataset.`);

      const resolved = resolveName(name, plat.components);
      if (!resolved) {
        const near = nearMatches(name, plat.components);
        const total = Object.keys(plat.components ?? {}).length;
        // Cross-platform near misses matter here: users routinely ask for the web
        // name (Toast, MessageBar) or another platform's name (PersonPicture on iOS).
        const elsewhere: string[] = [];
        for (const other of Object.keys(data.platforms ?? {})) {
          if (other === platform) continue;
          const hit = resolveName(name, data.platforms?.[other]?.components);
          if (hit) elsewhere.push(`${other}: ${hit}`);
        }
        return textResult(
          `"${name}" was not found in the ${PLATFORM_LABEL[platform]} dataset.` +
            (near.length ? `\n\nDid you mean: ${near.join(', ')}` : '') +
            (elsewhere.length ? `\n\nA component with that name does exist on: ${elsewhere.join(', ')}` : '') +
            `\n\nThis dataset covers ${total} ${platform} types. Absence here does not prove the type does not exist — ` +
            `verify against ${plat.repo ?? 'the platform library'} before concluding.` +
            `\n\nCall fluent_native_guidance with section "unverified" for what this dataset is known not to cover.`
        );
      }

      const out: Record<string, unknown> = {
        platform,
        name: resolved,
        component: plat.components?.[resolved],
      };

      const kind = (plat.components?.[resolved] as { kind?: string } | undefined)?.kind;
      const kindInfo = (plat.frameworkKinds ?? []).find((k) => k.kind === kind);
      if (kindInfo) out.frameworkKind = kindInfo;

      if (platform === 'windows' && kind === 'winui2') {
        out.maintenanceWarning = plat.maintenanceWarning;
      }
      if (platform === 'windows' && kind === 'wpf') {
        out.note =
          'WPF Fluent theme (official, .NET 9+). It restyles built-in WPF controls; it does not add a Fluent control set. WPF-UI (lepoco) is community, not Microsoft.';
      }
      if (platform === 'windows' && kind === 'winui3') {
        out.note =
          'WinUI 3 (Windows App SDK) is the recommended framework for new Windows desktop apps. XAML needs no prefix for Microsoft.UI.Xaml.Controls types.';
      }
      if (platform === 'windows' && (plat.components?.[resolved] as { alsoInWinUI2?: boolean } | undefined)?.alsoInWinUI2 === false && kind === 'winui3') {
        out.winui3Only = 'This type does not exist in WinUI 2 — a UWP app cannot use it.';
      }
      if (platform === 'android') {
        out.note =
          'Check the "generation" field: Fluent 2 = Jetpack Compose (com.microsoft.fluentui.tokenized.*), Fluent 1 = View/XML. Do not mix the two APIs in one screen.';
      }

      return textResult(JSON.stringify(out, null, 2));
    }
  );

  server.registerTool(
    'fluent_native_guidance',
    {
      title: 'Fluent 2 native reference — generations, install, tokens, theming, a11y',
      description:
        'Reference guidance for Fluent 2 on native platforms: which generation of the library is current and which is frozen, install coordinates (Swift Package Manager/CocoaPods, Gradle/Maven, NuGet), the design-token system and how to override it, brand/dark/high-contrast theming, the type ramp, accessibility behaviour that is and is not provided for free, cross-platform token and naming parity, the Fluent 2 site routes for each platform, and everything this dataset could NOT verify. Read this before choosing a package version or hand-writing tokens.',
      inputSchema: {
        platform: z
          .enum(['ios', 'android', 'windows'])
          .default('windows')
          .describe('Native platform. Ignored for the "cross-platform" and "routes" sections.'),
        section: z
          .enum([
            'generations',
            'install',
            'tokens',
            'theming',
            'typography',
            'accessibility',
            'cross-platform',
            'routes',
            'unverified',
            'all',
          ])
          .default('generations')
          .describe('Which section of the native reference to return.'),
      },
    },
    async ({ platform, section }) => {
      const data = load();
      if (!data) return textResult('Fluent native dataset not found at mcp/data/fluent-native.json.');

      if (section === 'cross-platform') {
        return textResult(JSON.stringify(data.crossPlatform ?? {}, null, 2));
      }
      if (section === 'routes') {
        return textResult(JSON.stringify({ siteRoutes: data.siteRoutes, siteRouteNotes: data.siteRouteNotes }, null, 2));
      }

      const plat = data.platforms?.[platform];
      if (!plat) return textResult(`Platform "${platform}" is not present in the Fluent native dataset.`);

      if (section === 'unverified') {
        const notes = unverifiedFor(data, platform);
        return textResult(
          JSON.stringify(
            {
              platform,
              count: notes.length,
              meaning: 'Facts the research could not confirm. Treat anything here as unknown, not as false.',
              notes,
            },
            null,
            2
          )
        );
      }

      const map: Record<string, unknown> = {
        generations: {
          generationStory: plat.generationStory,
          maintenanceWarning: plat.maintenanceWarning,
          frameworkKinds: plat.frameworkKinds,
          criticalNotes: plat.criticalNotes,
          sourceBranches: plat.sourceBranches,
          generations: plat.generations,
          frameworkChoice: plat.frameworkChoice,
          // WPF is listed here as a Fluent 2 option, and the most-installed WPF
          // "Fluent" package (lepoco/WPF-UI) is a community project, not
          // Microsoft. Carry that caution with the generation list rather than
          // burying it in `install`, or a reader stops at the default section
          // and ships an unofficial dependency believing it is first-party.
          communityVsOfficial:
            plat.install && typeof plat.install === 'object'
              ? (plat.install as Record<string, unknown>).wpfCommunityWarning
              : undefined,
        },
        install: { install: plat.install, repo: plat.repo, maintenanceWarning: plat.maintenanceWarning },
        tokens: plat.tokens,
        theming: { theming: plat.theming, color: plat.color, materials: plat.materials },
        typography: { typography: plat.typography, typographyNotes: plat.typographyNotes },
        accessibility: plat.accessibility,
      };

      if (section === 'all') {
        // The dataset is far too large to return in one response, so hand back a
        // map of what is available instead of truncating silently.
        const perSection = Object.fromEntries(
          Object.entries(map).map(([k, v]) => [
            k,
            Array.isArray(v)
              ? `${v.length} entries`
              : v && typeof v === 'object'
                ? `${Object.keys(v).filter((key) => (v as Record<string, unknown>)[key] !== undefined).length} keys`
                : v === undefined
                  ? 'not present'
                  : typeof v,
          ])
        );
        const summary = {
          platform,
          label: plat.label ?? PLATFORM_LABEL[platform],
          generationStory: plat.generationStory,
          components: `${Object.keys(plat.components ?? {}).length} types — look them up with fluent_native_component`,
          sections: perSection,
          alsoAvailable: {
            'cross-platform': 'shared concepts, naming differences, token parity across web/iOS/Android/Windows',
            routes: `${Array.isArray(data.siteRoutes) ? data.siteRoutes.length : 0} fluent2.microsoft.design native routes`,
            unverified: `${unverifiedFor(data, platform).length} unverified notes for ${platform}`,
          },
        };
        return textResult(
          `The Fluent native dataset is too large to return whole. Request a section.\n\n${JSON.stringify(summary, null, 2)}`
        );
      }

      const value = map[section];
      if (value === undefined) return textResult(`Section "${section}" is not present for platform "${platform}".`);
      return textResult(JSON.stringify(value, null, 2));
    }
  );
}
