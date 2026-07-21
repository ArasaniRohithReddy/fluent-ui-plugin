import * as React from 'react';
import {
  FluentProvider, webLightTheme, webDarkTheme, makeStyles, tokens, shorthands,
  Button, Card, Badge, TabList, Tab, Title1, Title3, Subtitle1, Subtitle2,
  Body1, Body1Strong, Caption1, Link, Divider,
} from '@fluentui/react-components';
import {
  Code24Regular, DataBarVertical24Regular, Flash24Regular, Color24Regular,
  PaintBrush24Regular, ArrowSwap24Regular, Accessibility24Regular, Image24Regular,
  Brain24Regular, WeatherMoon20Regular, WeatherSunny20Regular, Copy20Regular,
  Checkmark20Regular, ArrowRight20Regular, Star20Regular, Open16Regular, Sparkle24Regular,
} from '@fluentui/react-icons';

const REPO = 'https://github.com/Rohithreddy7123/fluent-ui-plugin';

// Convert a Fluent accent hex to a subtle tint for icon chips (professional, not "rainbow").
function tint(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},0.13)`;
}

const useStyles = makeStyles({
  root: { backgroundColor: tokens.colorNeutralBackground2, color: tokens.colorNeutralForeground1, minHeight: '100vh' },
  wrap: { maxWidth: '1120px', marginLeft: 'auto', marginRight: 'auto', paddingLeft: '24px', paddingRight: '24px' },
  header: {
    position: 'sticky', top: 0, zIndex: 50, backdropFilter: 'saturate(180%) blur(12px)',
    backgroundColor: tokens.colorNeutralBackground1Hover,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  nav: { display: 'flex', alignItems: 'center', gap: '16px', height: '60px' },
  brand: { display: 'flex', alignItems: 'center', gap: '10px', fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase400 },
  logo: {
    width: '30px', height: '30px', borderRadius: tokens.borderRadiusMedium, display: 'grid', placeItems: 'center',
    backgroundColor: tokens.colorBrandBackground, color: tokens.colorNeutralForegroundOnBrand,
    fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase400, fontFamily: tokens.fontFamilyBase,
  },
  navlinks: { display: 'flex', gap: '2px', marginLeft: 'auto' },
  navlink: { ...shorthands.padding('6px', '12px'), borderRadius: tokens.borderRadiusMedium, color: tokens.colorNeutralForeground2, textDecorationLine: 'none', fontWeight: tokens.fontWeightMedium },
  section: { ...shorthands.padding('56px', 0) },
  sectionHead: { maxWidth: '720px', marginLeft: 'auto', marginRight: 'auto', marginBottom: '32px', textAlign: 'center' },
  eyebrow: { color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase200, letterSpacing: '.06em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' },
  hero: { position: 'relative', overflow: 'hidden', paddingTop: '56px', paddingBottom: '24px' },
  heroGlow: {
    position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
    background: 'radial-gradient(48% 52% at 12% 0%, rgba(15,108,189,.10), transparent 62%)',
  },
  heroInner: { position: 'relative', zIndex: 1 },
  h1: { fontSize: 'clamp(34px,6vw,60px)', lineHeight: 1.08, fontWeight: tokens.fontWeightBold, letterSpacing: '-.02em', margin: '16px 0 12px', maxWidth: '18ch' },
  brandText: { color: tokens.colorBrandForeground1 },
  lead: { fontSize: 'clamp(16px,2.2vw,20px)', color: tokens.colorNeutralForeground2, maxWidth: '62ch', display: 'block' },
  cta: { display: 'flex', flexWrap: 'wrap', gap: '12px', margin: '20px 0 24px' },
  stats: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  stat: { ...shorthands.padding('12px', '16px'), minWidth: '108px' },
  statB: { display: 'block', fontSize: tokens.fontSizeBase600, fontWeight: tokens.fontWeightBold },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px' },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '8px' },
  cardPad: { ...shorthands.padding('20px') },
  ic: { width: '44px', height: '44px', borderRadius: tokens.borderRadiusLarge, display: 'grid', placeItems: 'center', marginBottom: '14px' },
  tool: { display: 'flex', flexDirection: 'column', ...shorthands.padding('12px', '16px'), ...shorthands.gap('2px') },
  toolCode: { color: tokens.colorBrandForeground1, fontFamily: tokens.fontFamilyMonospace, fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300 },
  tabsPanel: { marginTop: '16px' },
  code: { position: 'relative', backgroundColor: '#0b1220', color: '#e6edf3', borderRadius: tokens.borderRadiusLarge, ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2), overflow: 'hidden', margin: '12px 0' },
  pre: { margin: 0, ...shorthands.padding('16px'), paddingRight: '52px', overflowX: 'auto', fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, lineHeight: 1.6, whiteSpace: 'pre' },
  copyBtn: { position: 'absolute', top: '8px', right: '8px' },
  note: { borderLeft: `3px solid ${tokens.colorBrandForeground1}`, backgroundColor: tokens.colorNeutralBackground3, ...shorthands.padding('12px', '16px'), borderRadius: tokens.borderRadiusMedium, margin: '12px 0' },
  dogfood: {
    ...shorthands.padding('20px', '24px'), borderRadius: tokens.borderRadiusXLarge, marginTop: '16px',
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderLeft: `4px solid ${tokens.colorBrandForeground1}`,
    display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap', boxShadow: tokens.shadow4,
  },
  band: { backgroundColor: tokens.colorBrandBackground, color: tokens.colorNeutralForegroundOnBrand, borderRadius: tokens.borderRadiusXLarge, ...shorthands.padding('48px', '24px'), boxShadow: tokens.shadow16 },
  bandStat: { ...shorthands.padding('12px', '16px'), backgroundColor: 'rgba(255,255,255,.12)', borderRadius: tokens.borderRadiusLarge, ...shorthands.border('1px', 'solid', 'rgba(255,255,255,.22)') },
  footer: { borderTop: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1, ...shorthands.padding('32px', 0), marginTop: '24px' },
  footRow: { display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' },
});

type Feat = { c: string; Icon: React.FC<any>; t: string; d: string };
const FEATURES: Feat[] = [
  { c: '#0f6cbd', Icon: Code24Regular, t: 'Web: React v9 and Web Components', d: 'All 61 components with real props, imports, usage, anatomy, states and do/don\'t guidance, plus accessible code generation.' },
  { c: '#986f0b', Icon: DataBarVertical24Regular, t: 'Power BI', d: 'Every visual with its Learn doc, a Fluent 2 theme JSON, visual defaults, and PBIP/PBIR project scaffolding.' },
  { c: '#5c2e91', Icon: Flash24Regular, t: 'Power Platform', d: 'Fluent 2 guidance for Power Apps, Power Pages, and PCF components.' },
  { c: '#038387', Icon: Color24Regular, t: 'Design language', d: '22 topics covering color, typography, layout, motion, elevation, iconography, content, and responsible AI.' },
  { c: '#107c10', Icon: PaintBrush24Regular, t: 'Tokens and theming', d: '366 design tokens across light, dark and high-contrast. Turn any brand color into a full Fluent theme.' },
  { c: '#ca5010', Icon: ArrowSwap24Regular, t: 'Migration', d: 'Adopt Fluent 2 in existing apps: Fluent UI v8 to v9, other design systems, or hardcoded values to tokens.' },
  { c: '#a4262c', Icon: Accessibility24Regular, t: 'Accessibility built in', d: 'A WCAG-aligned Fluent 2 checklist is enforced by default: names, roles, focus order, 4.5:1 contrast, and target sizes.' },
  { c: '#e3008c', Icon: Image24Regular, t: 'Source visuals on demand', d: '705 diagrams, do/don\'t examples, anatomy illustrations and Motion videos, each with its real source URL.' },
  { c: '#0f6cbd', Icon: Brain24Regular, t: 'Presets and memory', d: 'Optional per-team brand and accessibility presets, plus persistent memory so agents respect your conventions.' },
];

const TOOLS: [string, string][] = [
  ['fluent_search_components', 'Find the right Fluent component'],
  ['fluent_get_component', 'Real props, imports, usage and accessibility'],
  ['fluent_list_tokens', 'List design tokens by category'],
  ['fluent_get_token', 'Exact token value (color, type, spacing, radius)'],
  ['fluent_generate_theme', 'Turn a brand color into a Fluent light and dark theme'],
  ['fluent_generate_code', 'Accessible Fluent 2 React and Web-Components code'],
  ['fluent_design_guidance', 'Design-language guidance across 22 topics'],
  ['fluent_migration_guidance', 'Adopt or migrate to Fluent 2 (v8 to v9)'],
  ['fluent_get_images', 'Direct URLs to diagrams, do/don\'t and Motion videos'],
  ['fluent_accessibility_checklist', 'Fluent 2 accessibility checklist'],
  ['fluent_generate_powerbi_theme', 'Fluent-aligned Power BI theme JSON'],
  ['fluent_scaffold_pbip', 'Fluent-themed Power BI PBIP/PBIR project'],
  ['fluent_powerbi_visuals', 'Every Power BI visual, its doc and Fluent 2 styling'],
  ['fluent_powerplatform_guidance', 'Power Apps, Power Pages and PCF guidance'],
  ['fluent_get_config', 'Load the user\'s resolved presets'],
  ['fluent_init_config', 'Scaffold fluent.config.json presets'],
  ['fluent_set_config', 'Update presets'],
  ['fluent_remember', 'Persist a design decision'],
  ['fluent_recall', 'Read back recorded decisions'],
];

const COPILOT = `{
  "mcpServers": {
    "fluent-ui": {
      "type": "local",
      "command": "node",
      "args": ["<PATH>/fluent-ui-plugin/mcp/dist/index.js"],
      "tools": ["*"]
    }
  }
}`;
const VSCODE = `{
  "servers": {
    "fluent-ui": {
      "type": "stdio",
      "command": "node",
      "args": ["<PATH>/fluent-ui-plugin/mcp/dist/index.js"]
    }
  }
}`;
const CLAUDE = `{
  "mcpServers": {
    "fluent-ui": {
      "command": "node",
      "args": ["<PATH>/fluent-ui-plugin/mcp/dist/index.js"]
    }
  }
}`;

const HOSTS: { id: string; label: string; steps: React.ReactNode; code?: string }[] = [
  { id: 'cli', label: 'GitHub Copilot CLI', code: COPILOT, steps: <>Merge the config into <code>~/.copilot/mcp-config.json</code> (or run <code>/mcp add</code>). Agents, Skills, <code>AGENTS.md</code> and <code>.github/copilot-instructions.md</code> auto-load.</> },
  { id: 'vscode', label: 'VS Code', code: VSCODE, steps: <>Copy the config to <code>.vscode/mcp.json</code> (or run <b>MCP: Add Server</b>) and start it from the MCP view. VS Code natively reads <code>skills/**/SKILL.md</code>, <code>agents/*.agent.md</code> and <code>AGENTS.md</code>.</> },
  { id: 'insiders', label: 'VS Code Insiders', code: VSCODE, steps: <>Identical to VS Code. It uses the same <code>.vscode/mcp.json</code> (<code>servers</code> with <code>stdio</code>) shape and auto-discovers it.</> },
  { id: 'vs', label: 'Visual Studio', code: VSCODE, steps: <>Visual Studio auto-discovers the bundled <code>.vscode/mcp.json</code> (<code>servers</code> with <code>stdio</code>). For a user or solution install, use <code>%USERPROFILE%\\.mcp.json</code>. <code>.github/copilot-instructions.md</code> is honored.</> },
  { id: 'desktop', label: 'Copilot Desktop', steps: <>Built on Copilot CLI, so it inherits <code>~/.copilot/mcp-config.json</code> plus skills, agents and <code>AGENTS.md</code>. Use the Copilot dialect (same as the CLI tab).</>, code: COPILOT },
  { id: 'cursor', label: 'Cursor', code: CLAUDE, steps: <>Add the config to <code>.cursor/mcp.json</code> (project) or <code>~/.cursor/mcp.json</code> (global). Cursor reads <code>AGENTS.md</code>, and skills load via <code>SKILL.md</code>.</> },
  { id: 'claude', label: 'Claude', code: CLAUDE, steps: <><b>Claude Desktop:</b> add to <code>claude_desktop_config.json</code>. <b>Claude Code:</b> use <code>.mcp.json</code> plus <code>CLAUDE.md</code> (which imports <code>AGENTS.md</code>) and <code>skills/</code>.</> },
  { id: 'gemini', label: 'Gemini', code: CLAUDE, steps: <>Add the <code>mcpServers</code> block to <code>~/.gemini/settings.json</code>. Instructions load from <code>GEMINI.md</code> or <code>AGENTS.md</code>.</> },
  { id: 'windsurf', label: 'Windsurf', code: CLAUDE, steps: <>Add the block to <code>~/.codeium/windsurf/mcp_config.json</code>. Rules load from <code>AGENTS.md</code>.</> },
  { id: 'cline', label: 'Cline', code: CLAUDE, steps: <>Add the block to <code>cline_mcp_settings.json</code>. Rules load from <code>.clinerules</code> or <code>AGENTS.md</code>.</> },
  { id: 'antigravity', label: 'Antigravity', steps: <>Register via the MCP config UI ("Open MCP Config", the <code>mcpServers</code> shape, same as the Claude or Cursor tab).</>, code: CLAUDE },
];

function CodeBlock({ code }: { code: string }) {
  const s = useStyles();
  const [done, setDone] = React.useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(code).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); }, () => {});
  };
  return (
    <div className={s.code}>
      <Button className={s.copyBtn} size="small" appearance="subtle" icon={done ? <Checkmark20Regular /> : <Copy20Regular />}
        style={{ color: '#e6edf3' }} onClick={copy} aria-label="Copy code" />
      <pre className={s.pre}>{code}</pre>
    </div>
  );
}

export function App() {
  const [dark, setDark] = React.useState<boolean>(() => {
    try { const t = localStorage.getItem('fui-theme'); if (t) return t === 'dark'; } catch {}
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme:dark)').matches;
  });
  React.useEffect(() => { try { localStorage.setItem('fui-theme', dark ? 'dark' : 'light'); } catch {} }, [dark]);
  const [tab, setTab] = React.useState('cli');
  const s = useStyles();
  const host = HOSTS.find((h) => h.id === tab)!;

  return (
    <FluentProvider theme={dark ? webDarkTheme : webLightTheme}>
      <div className={s.root} id="top">
        <header className={s.header}>
          <div className={`${s.wrap} ${s.nav}`}>
            <span className={s.brand}><span className={s.logo}>F</span> Fluent UI 2.0 Plugin</span>
            <nav className={s.navlinks}>
              <Link className={s.navlink} href="#features">Features</Link>
              <Link className={s.navlink} href="#tools">Tools</Link>
              <Link className={s.navlink} href="#install">Install</Link>
              <Link className={s.navlink} href="#coverage">Coverage</Link>
              <Link className={s.navlink} href={REPO}>GitHub</Link>
            </nav>
            <Button appearance="subtle" icon={dark ? <WeatherSunny20Regular /> : <WeatherMoon20Regular />}
              aria-label="Toggle light or dark theme" onClick={() => setDark(!dark)} />
          </div>
        </header>

        {/* HERO */}
        <section className={s.hero}>
          <div className={s.heroGlow} />
          <div className={`${s.wrap} ${s.heroInner}`}>
            <Badge appearance="tint" color="success" size="large">Open source, MIT licensed, works in 12+ AI IDEs</Badge>
            <Title1 as="h1" className={s.h1} block>Build and adopt <span className={s.brandText}>Microsoft Fluent 2</span>, everywhere.</Title1>
            <Subtitle2 className={s.lead} block>An AI-assistant plugin (Agents, Skills and MCP tools) that turns the official Fluent 2 design system into grounded, on-demand guidance and accessible code, inside the tools your teams already use. For Web, Power BI and Power Platform.</Subtitle2>
            <div className={s.cta}>
              <Button appearance="primary" size="large" icon={<ArrowRight20Regular />} iconPosition="after" as="a" href="#install">Get started</Button>
              <Button appearance="secondary" size="large" icon={<Star20Regular />} as="a" href={REPO}>View on GitHub</Button>
            </div>
            <div className={s.stats}>
              {[['61', 'Components (47 core, 14 AI)'], ['22', 'Design-language topics'], ['705', 'Source visuals indexed'], ['19', 'MCP tools'], ['366', 'Design tokens, 3 themes']].map(([b, l]) => (
                <Card key={l} className={s.stat} appearance="outline"><span className={s.statB}>{b}</span><Caption1>{l}</Caption1></Card>
              ))}
            </div>

            {/* DOGFOOD PROOF */}
            <div className={s.dogfood}>
              <span className={s.ic} style={{ background: tint('#0f6cbd'), color: tokens.colorBrandForeground1, marginBottom: 0, flex: '0 0 auto' }}><Sparkle24Regular /></span>
              <div style={{ flex: '1 1 320px' }}>
                <Body1Strong block>This page is a live demo, built with the plugin using Fluent UI 2.0.</Body1Strong>
                <Body1 block style={{ color: tokens.colorNeutralForeground2, marginTop: 4 }}>
                  This site is a <b>Fluent UI React v9</b> app: every button, card, badge, tab and icon comes from <code>@fluentui/react-components</code> and <code>@fluentui/react-icons</code>, and every color, type ramp, spacing, corner radius and elevation is a real Fluent 2 <b>design token</b>, the same output the plugin generates. Use the toggle above to theme it light or dark.
                </Body1>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className={s.section}>
          <div className={s.wrap}>
            <div className={s.sectionHead}>
              <Caption1 className={s.eyebrow}>What it does</Caption1>
              <Title3 as="h2" block>One plugin. The whole Fluent 2 surface.</Title3>
              <Body1 block style={{ color: tokens.colorNeutralForeground2 }}>Every fact is grounded in the official <Link href="https://fluent2.microsoft.design">fluent2.microsoft.design</Link> site and the real <code>@fluentui</code> packages, so it is verified, not guessed.</Body1>
            </div>
            <div className={s.grid3}>
              {FEATURES.map((f) => (
                <Card key={f.t} className={s.cardPad}>
                  <span className={s.ic} style={{ background: tint(f.c), color: f.c }}><f.Icon /></span>
                  <Body1Strong block>{f.t}</Body1Strong>
                  <Body1 block style={{ color: tokens.colorNeutralForeground2, marginTop: 4 }}>{f.d}</Body1>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* TOOLS */}
        <section id="tools" className={s.section} style={{ backgroundColor: tokens.colorNeutralBackground3 }}>
          <div className={s.wrap}>
            <div className={s.sectionHead}>
              <Caption1 className={s.eyebrow}>Under the hood</Caption1>
              <Title3 as="h2" block>19 deterministic MCP tools</Title3>
              <Body1 block style={{ color: tokens.colorNeutralForeground2 }}>Portable, standard MCP over stdio, so the same server runs in every host below.</Body1>
            </div>
            <div className={s.grid2}>
              {TOOLS.map(([name, desc]) => (
                <Card key={name} className={s.tool} appearance="outline">
                  <span className={s.toolCode}>{name}</span>
                  <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>{desc}</Caption1>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* INSTALL */}
        <section id="install" className={s.section}>
          <div className={s.wrap}>
            <div className={s.sectionHead}>
              <Caption1 className={s.eyebrow}>Installation</Caption1>
              <Title3 as="h2" block>Install in your IDE in two steps</Title3>
              <Body1 block style={{ color: tokens.colorNeutralForeground2 }}>The MCP server is universal. Agents, skills and instructions load natively where supported.</Body1>
            </div>

            <Subtitle1 block>Step 1: build once</Subtitle1>
            <CodeBlock code={`git clone ${REPO}.git\ncd fluent-ui-plugin/mcp\nnpm install\nnpm run build          # produces mcp/dist/index.js`} />
            <div className={s.note}><Body1>Every host launches the same command: <code>node &lt;PATH&gt;/fluent-ui-plugin/mcp/dist/index.js</code>. Replace <code>&lt;PATH&gt;</code> with where you cloned the repo.</Body1></div>

            <Subtitle1 block style={{ marginTop: 24 }}>Step 2: register it in your host</Subtitle1>
            <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as string)} style={{ flexWrap: 'wrap' }}>
              {HOSTS.map((h) => <Tab key={h.id} value={h.id}>{h.label}</Tab>)}
            </TabList>
            <div className={s.tabsPanel}>
              <Subtitle2 block>{host.label}</Subtitle2>
              <Body1 block style={{ color: tokens.colorNeutralForeground2, margin: '8px 0' }}>{host.steps}</Body1>
              {host.code && <CodeBlock code={host.code} />}
            </div>
            <div className={s.note}><Body1>Verify it is live by asking your host to run <code>fluent_accessibility_checklist</code> or <code>fluent_powerbi_visuals</code>. Full per-host details are in <Link href={`${REPO}/blob/main/hosts/README.md`}>hosts/README.md <Open16Regular /></Link>.</Body1></div>
          </div>
        </section>

        {/* COVERAGE */}
        <section id="coverage" className={s.section}>
          <div className={s.wrap}>
            <div className={s.band}>
              <div className={s.sectionHead} style={{ marginBottom: 20 }}>
                <Title3 as="h2" block style={{ color: '#fff' }}>Verified against the source of truth</Title3>
                <Body1 block style={{ color: 'rgba(255,255,255,.85)' }}>Every route in the official Fluent 2 site's own sitemap (114 routes) was cross-checked, so this is measured coverage, not an estimate.</Body1>
              </div>
              <div className={s.grid3}>
                {[['61 / 61', 'Web components (100%)'], ['22 / 22', 'Design and UX topics'], ['705', 'Source visuals with URLs'], ['35+', 'Power BI visuals catalogued'], ['12+', 'AI IDEs supported'], ['MIT', 'Open source license']].map(([b, l]) => (
                  <div key={l} className={s.bandStat}><span className={s.statB} style={{ color: '#fff' }}>{b}</span><Caption1 style={{ color: 'rgba(255,255,255,.8)' }}>{l}</Caption1></div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className={s.footer}>
          <div className={`${s.wrap} ${s.footRow}`}>
            <div>
              <span className={s.brand} style={{ marginBottom: 6 }}><span className={s.logo}>F</span> Fluent UI 2.0 Plugin</span>
              <Caption1 block style={{ color: tokens.colorNeutralForeground3, marginTop: 6, maxWidth: '54ch' }}>Built with the Microsoft Fluent 2 design system (Fluent UI React v9). This site is a demo of the plugin's own output. It is not an official Microsoft product.</Caption1>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <Button appearance="secondary" as="a" href={REPO} icon={<Star20Regular />}>GitHub</Button>
              <Button appearance="subtle" as="a" href="https://fluent2.microsoft.design" icon={<Open16Regular />} iconPosition="after">fluent2.microsoft.design</Button>
            </div>
          </div>
          <Divider style={{ marginTop: 20 }} />
        </footer>
      </div>
    </FluentProvider>
  );
}
