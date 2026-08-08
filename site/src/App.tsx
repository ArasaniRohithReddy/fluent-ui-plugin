import * as React from 'react';
import {
  FluentProvider, webLightTheme, webDarkTheme, makeStyles, tokens, shorthands,
  Button, Badge, TabList, Tab, Title1, Title3, Subtitle1, Subtitle2,
  Body1, Body1Strong, Caption1, Link, Divider,
} from '@fluentui/react-components';
import {
  Code24Regular, DataBarVertical24Regular, Flash24Regular, Color24Regular,
  PaintBrush24Regular, ArrowSwap24Regular, Accessibility24Regular, Image24Regular,
  Brain24Regular, WeatherMoon20Regular, WeatherSunny20Regular, Copy20Regular,
  Checkmark20Regular, ArrowRight20Regular, Star20Regular, Open16Regular, Sparkle20Filled,
  Bug24Regular, Lightbulb24Regular, Chat24Regular, BranchFork24Regular, ShieldCheckmark24Regular, PeopleCommunity24Regular,
  Eye20Regular,
} from '@fluentui/react-icons';

const REPO = 'https://github.com/ArasaniRohithReddy/fluent-ui-plugin';

function tint(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},0.14)`;
}

const useStyles = makeStyles({
  root: { position: 'relative', color: tokens.colorNeutralForeground1, minHeight: '100vh', backgroundColor: tokens.colorNeutralBackground2, overflowX: 'hidden' },
  bg: {
    position: 'fixed', inset: '0', zIndex: 0, pointerEvents: 'none',
    background: 'radial-gradient(42% 46% at 12% -2%, rgba(40,134,222,.22), transparent 60%), radial-gradient(38% 42% at 92% 4%, rgba(3,131,135,.16), transparent 60%), radial-gradient(46% 42% at 72% 108%, rgba(92,46,145,.14), transparent 60%)',
  },
  layer: { position: 'relative', zIndex: 1 },
  wrap: { maxWidth: '1140px', marginLeft: 'auto', marginRight: 'auto', paddingLeft: '24px', paddingRight: '24px' },
  header: {
    position: 'sticky', top: 0, zIndex: 50, backdropFilter: 'saturate(180%) blur(16px)', WebkitBackdropFilter: 'saturate(180%) blur(16px)',
    backgroundColor: 'var(--glass-bg)', borderBottom: `1px solid var(--glass-brd)`,
  },
  nav: { display: 'flex', alignItems: 'center', gap: '16px', height: '62px' },
  brand: { display: 'flex', alignItems: 'center', gap: '11px', fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase400 },
  logo: {
    width: '34px', height: '34px', borderRadius: '11px', display: 'grid', placeItems: 'center', color: '#fff',
    background: 'linear-gradient(140deg,#2886de,#0f6cbd 52%,#0a7c86)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.45), inset 0 -6px 12px rgba(0,0,0,.18), 0 6px 14px rgba(15,108,189,.42)',
  },
  navlinks: { display: 'flex', gap: '2px', marginLeft: 'auto' },
  navlink: { ...shorthands.padding('7px', '13px'), borderRadius: tokens.borderRadiusMedium, color: tokens.colorNeutralForeground2, textDecorationLine: 'none', fontWeight: tokens.fontWeightMedium, ':hover': { backgroundColor: 'var(--glass-bg)', color: tokens.colorNeutralForeground1 } },
  section: { ...shorthands.padding('44px', 0) },
  sectionHead: { maxWidth: '740px', marginLeft: 'auto', marginRight: 'auto', marginBottom: '28px', textAlign: 'center' },
  eyebrow: { color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase200, letterSpacing: '.08em', textTransform: 'uppercase', display: 'block', marginBottom: '10px' },

  // glass surface
  glass: {
    backgroundColor: 'var(--glass-bg)',
    ...shorthands.border('1px', 'solid', 'var(--glass-brd)'),
    backdropFilter: 'blur(20px) saturate(150%)', WebkitBackdropFilter: 'blur(20px) saturate(150%)',
    boxShadow: `${tokens.shadow8}, inset 0 1px 0 var(--glass-hi)`,
  },
  hoverable: {
    transition: 'transform .25s cubic-bezier(.1,.9,.2,1), box-shadow .25s, border-color .25s',
    ':hover': { transform: 'translateY(-5px)', boxShadow: `${tokens.shadow28}, inset 0 1px 0 var(--glass-hi)`, borderTopColor: 'rgba(15,108,189,.5)', borderRightColor: 'rgba(15,108,189,.5)', borderBottomColor: 'rgba(15,108,189,.5)', borderLeftColor: 'rgba(15,108,189,.5)' },
  },

  hero: { position: 'relative', paddingTop: '40px', paddingBottom: '16px' },
  h1: { fontSize: 'clamp(36px,6.4vw,66px)', lineHeight: 1.04, fontWeight: tokens.fontWeightBold, letterSpacing: '-.025em', margin: '18px 0 14px', maxWidth: '18ch' },
  brandText: { color: tokens.colorBrandForeground1 },
  lead: { fontSize: 'clamp(16px,2.2vw,21px)', color: tokens.colorNeutralForeground2, maxWidth: '64ch', display: 'block', lineHeight: 1.5 },
  cta: { display: 'flex', flexWrap: 'wrap', gap: '12px', margin: '24px 0 28px' },
  ctaGlow: { boxShadow: '0 8px 24px rgba(15,108,189,.5)' },
  stats: { display: 'flex', flexWrap: 'wrap', gap: '10px' },
  stat: { ...shorthands.padding('12px', '18px'), minWidth: '112px', borderRadius: '14px' },
  statB: { display: 'block', fontSize: tokens.fontSizeBase600, fontWeight: tokens.fontWeightBold, lineHeight: 1.1 },

  grid3: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '18px' },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '12px' },
  card: { ...shorthands.padding('22px'), borderRadius: '18px' },
  ic: { width: '46px', height: '46px', borderRadius: '13px', display: 'grid', placeItems: 'center', marginBottom: '15px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.25)' },
  tool: { display: 'flex', flexDirection: 'column', ...shorthands.padding('13px', '17px'), ...shorthands.gap('3px'), borderRadius: '14px' },
  toolCode: { color: tokens.colorBrandForeground1, fontFamily: tokens.fontFamilyMonospace, fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300 },
  promptBubble: { display: 'inline-block', ...shorthands.padding('9px', '13px'), borderTopLeftRadius: '13px', borderTopRightRadius: '13px', borderBottomRightRadius: '13px', borderBottomLeftRadius: '4px', backgroundColor: tint('#0f6cbd'), color: tokens.colorNeutralForeground1, fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300, lineHeight: 1.4 },
  usageResp: { display: 'flex', gap: '8px', marginTop: '13px', alignItems: 'flex-start' },

  tabsPanel: { marginTop: '18px' },
  code: {
    position: 'relative', backgroundColor: 'var(--code-bg)', color: '#e9eef5', borderRadius: '14px',
    ...shorthands.border('1px', 'solid', 'var(--glass-brd)'),
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    boxShadow: `${tokens.shadow8}, inset 0 1px 0 rgba(255,255,255,.08)`, overflow: 'hidden', margin: '12px 0',
  },
  pre: { margin: 0, ...shorthands.padding('16px'), paddingRight: '52px', overflowX: 'auto', fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, lineHeight: 1.65, whiteSpace: 'pre' },
  copyBtn: { position: 'absolute', top: '9px', right: '9px' },
  note: { borderLeftWidth: '3px', borderLeftStyle: 'solid', borderLeftColor: tokens.colorBrandForeground1, ...shorthands.padding('13px', '17px'), borderTopRightRadius: '12px', borderBottomRightRadius: '12px', margin: '14px 0' },
  dogfood: { ...shorthands.padding('22px', '24px'), borderRadius: '20px', marginTop: '20px', borderLeftWidth: '4px', borderLeftStyle: 'solid', borderLeftColor: tokens.colorBrandForeground1, display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' },

  band: {
    position: 'relative', overflow: 'hidden', borderRadius: '26px', ...shorthands.padding('52px', '36px'), color: '#fff',
    background: 'linear-gradient(135deg, rgba(24,134,222,.96), rgba(14,71,117,.96))',
    ...shorthands.border('1px', 'solid', 'rgba(255,255,255,.18)'),
    boxShadow: `${tokens.shadow28}, inset 0 1px 0 rgba(255,255,255,.28)`,
  },
  bandSheen: { position: 'absolute', inset: '0', pointerEvents: 'none', background: 'radial-gradient(60% 80% at 82% -10%, rgba(255,255,255,.30), transparent 55%)' },
  bandStat: { position: 'relative', ...shorthands.padding('14px', '18px'), backgroundColor: 'rgba(255,255,255,.13)', borderRadius: '16px', ...shorthands.border('1px', 'solid', 'rgba(255,255,255,.26)'), backdropFilter: 'blur(6px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.3)' },

  footer: { borderTop: `1px solid var(--glass-brd)`, ...shorthands.padding('34px', 0), marginTop: '28px', backgroundColor: 'var(--glass-bg)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' },
  footRow: { display: 'flex', flexWrap: 'wrap', gap: '18px', alignItems: 'center', justifyContent: 'space-between' },
  visitors: {
    display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: '18px',
    ...shorthands.padding('8px', '14px'), borderRadius: tokens.borderRadiusCircular,
    backgroundColor: 'var(--glass-bg)', ...shorthands.border('1px', 'solid', 'var(--glass-brd)'),
    color: tokens.colorNeutralForeground2, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
  },
  visitorsImg: { display: 'block', height: '20px' },
});

type Feat = { c: string; Icon: React.FC<any>; t: string; d: string };
const FEATURES: Feat[] = [
  { c: '#0f6cbd', Icon: Code24Regular, t: 'Web: React v9 and Web Components', d: 'All 61 components with real props, imports, usage, anatomy, states and do/don\'t guidance, plus accessible code generation.' },
  { c: '#986f0b', Icon: DataBarVertical24Regular, t: 'Power BI', d: 'Every visual with its Learn doc, a Fluent 2 theme JSON, and PBIP/PBIR scaffolding. Also applies Fluent 2 to an existing report and repairs the layout distortion the theme introduces.' },
  { c: '#5c2e91', Icon: Flash24Regular, t: 'Power Platform', d: 'Fluent 2 guidance for Power Apps canvas, model-driven apps (the New Look), Power Pages, and PCF components.' },
  { c: '#038387', Icon: Color24Regular, t: 'Design language', d: '36 topics covering color, typography, layout, motion, elevation, iconography, content engineering, AI evaluation, and responsible AI.' },
  { c: '#107c10', Icon: PaintBrush24Regular, t: 'Tokens and theming', d: '366 design tokens across light, dark and high-contrast. Turn any brand color into a full Fluent theme.' },
  { c: '#ca5010', Icon: ArrowSwap24Regular, t: 'Migration', d: 'Adopt Fluent 2 in existing apps: Fluent UI v8 to v9, other design systems, or hardcoded values to tokens.' },
  { c: '#a4262c', Icon: Accessibility24Regular, t: 'Accessibility built in', d: 'A WCAG-aligned Fluent 2 checklist is enforced by default: names, roles, focus order, 4.5:1 contrast, and target sizes.' },
  { c: '#e3008c', Icon: Image24Regular, t: 'Source visuals on demand', d: '705 diagrams, do/don\'t examples, anatomy illustrations and Motion videos, each with its real source URL.' },
  { c: '#0f6cbd', Icon: Brain24Regular, t: 'Presets and memory', d: 'Optional per-team brand and accessibility presets, plus persistent memory so agents respect your conventions.' },
];

const USAGE: [string, string][] = [
  ['Build an accessible Fluent 2 sign-in form with email and password.', 'The web engineer generates FluentProvider, Field, Input and Button code with accessibility baked in.'],
  ['What is the design token for the brand color?', 'fluent_get_token returns colorBrandBackground = #0f6cbd, ready to use in makeStyles.'],
  ['Show me the Card component anatomy.', 'fluent_get_images returns the official anatomy diagram URL from fluent2.microsoft.design.'],
  ['Apply Fluent 2 to my existing Power BI report and fix the overlaps.', 'The Power BI designer applies the theme to your PBIR files, then detects and repairs theme-induced distortion while preserving bookmarks and navigation.'],
  ['Migrate this Fluent UI v8 button to v9.', 'fluent_migration_guidance maps the v8 API to the v9 component and tokens.'],
  ['Set our brand color to #742774 and remember it.', 'fluent_init_config, fluent_set_config and fluent_remember persist your preset for next time.'],
];

const TOOLS: [string, string][] = [
  ['fluent_search_components', 'Find the right Fluent component'],
  ['fluent_get_component', 'Real props, imports, usage and accessibility'],
  ['fluent_list_tokens', 'List design tokens by category'],
  ['fluent_get_token', 'Exact token value (color, type, spacing, radius)'],
  ['fluent_generate_theme', 'Turn a brand color into a Fluent light and dark theme'],
  ['fluent_generate_code', 'Accessible Fluent 2 React and Web-Components code'],
  ['fluent_design_guidance', 'Design-language guidance across 36 topics'],
  ['fluent_migration_guidance', 'Adopt or migrate to Fluent 2 (v8 to v9)'],
  ['fluent_get_images', 'Direct URLs to diagrams, do/don\'t and Motion videos'],
  ['fluent_accessibility_checklist', 'Fluent 2 accessibility checklist'],
  ['fluent_generate_powerbi_theme', 'Fluent-aligned Power BI theme JSON'],
  ['fluent_scaffold_pbip', 'Fluent-themed Power BI PBIP/PBIR project'],
  ['fluent_pbir_audit', 'Census an existing PBIR report: overrides, theme wiring, geometry'],
  ['fluent_pbir_apply_theme', 'Register a Fluent theme in an existing PBIR report'],
  ['fluent_pbir_normalize_inline', 'Delete the inline overrides that make a theme inert'],
  ['fluent_pbir_verify', 'Assertions V1-V9 including the theme-effectiveness ratio'],
  ['fluent_powerbi_visuals', 'Every Power BI visual, its doc and Fluent 2 styling'],
  ['fluent_powerplatform_guidance', 'Power Apps, Power Pages and PCF guidance'],
  ['fluent_get_config', 'Load the user\'s resolved presets'],
  ['fluent_init_config', 'Scaffold fluent.config.json presets'],
  ['fluent_set_config', 'Update presets'],
  ['fluent_remember', 'Persist a design decision'],
  ['fluent_recall', 'Read back recorded decisions'],
];

const COMMUNITY: { c: string; Icon: React.FC<any>; t: string; d: string; href: string; cta: string }[] = [
  { c: '#a4262c', Icon: Bug24Regular, t: 'Report a bug', d: 'Found something broken? File a detailed bug report and we will take a look.', href: `${REPO}/issues/new?template=bug_report.yml`, cta: 'Open a bug report' },
  { c: '#986f0b', Icon: Lightbulb24Regular, t: 'Request a feature', d: 'Have an idea for a new tool, skill, or surface? Tell us what you need.', href: `${REPO}/issues/new?template=feature_request.yml`, cta: 'Request a feature' },
  { c: '#038387', Icon: Chat24Regular, t: 'Ask and discuss', d: 'Questions, ideas, and show and tell all live in GitHub Discussions.', href: `${REPO}/discussions`, cta: 'Open Discussions' },
  { c: '#0f6cbd', Icon: BranchFork24Regular, t: 'Send a pull request', d: 'Fork the repo, make your change, and open a PR. The guide has the setup.', href: `${REPO}/blob/main/CONTRIBUTING.md`, cta: 'Read the contributing guide' },
  { c: '#5c2e91', Icon: ShieldCheckmark24Regular, t: 'Report a vulnerability', d: 'Please report security issues privately, never as a public issue.', href: `${REPO}/security/policy`, cta: 'See the security policy' },
  { c: '#107c10', Icon: PeopleCommunity24Regular, t: 'Star and share', d: 'If this helps you, a star and a share go a long way. It is MIT licensed.', href: REPO, cta: 'Star on GitHub' },
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
  const copy = () => { navigator.clipboard?.writeText(code).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); }, () => {}); };
  return (
    <div className={s.code}>
      <Button className={s.copyBtn} size="small" appearance="subtle" icon={done ? <Checkmark20Regular /> : <Copy20Regular />} style={{ color: '#e9eef5' }} onClick={copy} aria-label="Copy code" />
      <pre className={s.pre}>{code}</pre>
    </div>
  );
}

/**
 * Visitor counter. GitHub Pages is static, so the count comes from a hosted
 * badge service; requesting the image is what records the visit. That is why
 * it is not lazy-loaded and why it sits in the hero: in the footer it only
 * counted people who scrolled to the bottom, which undercounted badly.
 *
 * The service exposes no CORS headers, so the count cannot be fetched and
 * rendered as text. The label and chrome around it are native Fluent, and the
 * whole chip removes itself if the service is unreachable rather than leaving
 * a broken image behind.
 */
function VisitorCount() {
  const s = useStyles();
  const [failed, setFailed] = React.useState(false);
  if (failed) return null;
  const src =
    'https://hits.sh/arasanirohithreddy.github.io/fluent-ui-plugin.svg' +
    '?style=flat-square&label=&color=0f6cbd&labelColor=0f6cbd';
  return (
    <div className={s.visitors}>
      <Eye20Regular aria-hidden="true" />
      <Caption1>Visitors</Caption1>
      <img className={s.visitorsImg} src={src} alt="Total visitors to this site" onError={() => setFailed(true)} />
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
  const glass = `${s.glass}`;

  const rootVars = {
    ['--glass-bg' as any]: dark ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.66)',
    ['--glass-brd' as any]: dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.85)',
    ['--glass-hi' as any]: dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.95)',
    ['--code-bg' as any]: dark ? 'rgba(10,15,24,0.66)' : 'rgba(13,20,34,0.94)',
  } as React.CSSProperties;

  return (
    <FluentProvider theme={dark ? webDarkTheme : webLightTheme}>
      <div className={s.root} id="top" style={rootVars}>
        <div className={s.bg} />
        <div className={s.layer}>
          <header className={s.header}>
            <div className={`${s.wrap} ${s.nav}`}>
              <span className={s.brand}><span className={s.logo}><Sparkle20Filled /></span> Fluent UI 2.0 Plugin</span>
              <nav className={s.navlinks}>
                <Link className={s.navlink} href="#features">Features</Link>
                <Link className={s.navlink} href="#usage">Usage</Link>
                <Link className={s.navlink} href="#tools">Tools</Link>
                <Link className={s.navlink} href="#install">Install</Link>
                <Link className={s.navlink} href="#coverage">Coverage</Link>
                <Link className={s.navlink} href="#community">Community</Link>
                <Link className={s.navlink} href={REPO}>GitHub</Link>
              </nav>
              <Button appearance="subtle" icon={dark ? <WeatherSunny20Regular /> : <WeatherMoon20Regular />} aria-label="Toggle light or dark theme" onClick={() => setDark(!dark)} />
            </div>
          </header>

          {/* HERO */}
          <section className={s.hero}>
            <div className={s.wrap}>
              <Badge appearance="tint" color="success" size="large">Open source, MIT licensed, works in 12+ AI IDEs</Badge>
              <Title1 as="h1" className={s.h1} block>Build and adopt <span className={s.brandText}>Microsoft Fluent 2</span>, everywhere.</Title1>
              <Subtitle2 className={s.lead} block>An AI-assistant plugin (Agents, Skills and MCP tools) that turns the official Fluent 2 design system into grounded, on-demand guidance and accessible code, inside the tools your teams already use. For Web, Power BI and Power Platform.</Subtitle2>
              <div className={s.cta}>
                <Button appearance="primary" size="large" className={s.ctaGlow} icon={<ArrowRight20Regular />} iconPosition="after" as="a" href="#install">Get started</Button>
                <Button appearance="secondary" size="large" icon={<Star20Regular />} as="a" href={REPO}>View on GitHub</Button>
              </div>
              <div className={s.stats}>
                {[['61', 'Components (47 core, 14 AI)'], ['36', 'Design-language topics'], ['705', 'Source visuals indexed'], ['23', 'MCP tools'], ['366', 'Design tokens, 3 themes']].map(([b, l]) => (
                  <div key={l} className={`${glass} ${s.stat}`}><span className={s.statB}>{b}</span><Caption1 style={{ color: tokens.colorNeutralForeground3 }}>{l}</Caption1></div>
                ))}
              </div>
              <VisitorCount />

              {/* DOGFOOD PROOF */}
              <div className={`${glass} ${s.dogfood}`}>
                <span className={s.ic} style={{ background: 'linear-gradient(140deg,#2886de,#0a7c86)', color: '#fff', marginBottom: 0, flex: '0 0 auto' }}><Sparkle20Filled /></span>
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
                  <div key={f.t} className={`${glass} ${s.hoverable} ${s.card}`}>
                    <span className={s.ic} style={{ background: tint(f.c), color: f.c }}><f.Icon /></span>
                    <Body1Strong block>{f.t}</Body1Strong>
                    <Body1 block style={{ color: tokens.colorNeutralForeground2, marginTop: 4 }}>{f.d}</Body1>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* USAGE */}
          <section id="usage" className={s.section}>
            <div className={s.wrap}>
              <div className={s.sectionHead}>
                <Caption1 className={s.eyebrow}>How to use it</Caption1>
                <Title3 as="h2" block>Just ask. It routes to the right tool.</Title3>
                <Body1 block style={{ color: tokens.colorNeutralForeground2 }}>After installing, talk to your AI assistant in natural language. The router agent picks the right specialist, skill and MCP tool, so you never call tools by hand. Here are real examples.</Body1>
                <div style={{ marginTop: 18 }}>
                  <Button appearance="primary" as="a" href={`${REPO}/blob/main/GUIDE.md`} icon={<ArrowRight20Regular />} iconPosition="after">Read the full install and usage guide</Button>
                </div>
              </div>
              <div className={s.grid3}>
                {USAGE.map(([q, a]) => (
                  <div key={q} className={`${glass} ${s.hoverable} ${s.card}`}>
                    <span className={s.promptBubble}>{q}</span>
                    <div className={s.usageResp}>
                      <ArrowRight20Regular style={{ color: tokens.colorBrandForeground1, flex: '0 0 auto', marginTop: 1 }} />
                      <Caption1 style={{ color: tokens.colorNeutralForeground2, lineHeight: 1.45 }}>{a}</Caption1>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* TOOLS */}
          <section id="tools" className={s.section}>
            <div className={s.wrap}>
              <div className={s.sectionHead}>
                <Caption1 className={s.eyebrow}>Under the hood</Caption1>
                <Title3 as="h2" block>23 deterministic MCP tools</Title3>
                <Body1 block style={{ color: tokens.colorNeutralForeground2 }}>Portable, standard MCP over stdio, so the same server runs in every host below.</Body1>
              </div>
              <div className={s.grid2}>
                {TOOLS.map(([name, desc]) => (
                  <div key={name} className={`${glass} ${s.hoverable} ${s.tool}`}>
                    <span className={s.toolCode}>{name}</span>
                    <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>{desc}</Caption1>
                  </div>
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
              <div className={`${glass} ${s.note}`}><Body1>Every host launches the same command: <code>node &lt;PATH&gt;/fluent-ui-plugin/mcp/dist/index.js</code>. Replace <code>&lt;PATH&gt;</code> with where you cloned the repo.</Body1></div>

              <Subtitle1 block style={{ marginTop: 26 }}>Step 2: register it in your host</Subtitle1>
              <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as string)} style={{ flexWrap: 'wrap' }}>
                {HOSTS.map((h) => <Tab key={h.id} value={h.id}>{h.label}</Tab>)}
              </TabList>
              <div className={s.tabsPanel}>
                <Subtitle2 block>{host.label}</Subtitle2>
                <Body1 block style={{ color: tokens.colorNeutralForeground2, margin: '8px 0' }}>{host.steps}</Body1>
                {host.code && <CodeBlock code={host.code} />}
              </div>
              <div className={`${glass} ${s.note}`}><Body1>Verify it is live by asking your host to run <code>fluent_accessibility_checklist</code> or <code>fluent_powerbi_visuals</code>. Full per-host details are in <Link href={`${REPO}/blob/main/hosts/README.md`}>hosts/README.md <Open16Regular /></Link>.</Body1></div>
            </div>
          </section>

          {/* COVERAGE */}
          <section id="coverage" className={s.section}>
            <div className={s.wrap}>
              <div className={s.band}>
                <div className={s.bandSheen} />
                <div className={s.sectionHead} style={{ marginBottom: 22, position: 'relative' }}>
                  <Title3 as="h2" block style={{ color: '#fff' }}>Verified against the source of truth</Title3>
                  <Body1 block style={{ color: 'rgba(255,255,255,.9)' }}>Every route in the official Fluent 2 site's own sitemap (132 routes) was cross-checked, so this is measured coverage, not an estimate.</Body1>
                </div>
                <div className={s.grid3}>
                  {[['61 / 61', 'Web components (100%)'], ['36 / 36', 'Design and UX topics'], ['705', 'Source visuals with URLs'], ['35+', 'Power BI visuals catalogued'], ['12+', 'AI IDEs supported'], ['MIT', 'Open source license']].map(([b, l]) => (
                    <div key={l} className={s.bandStat}><span className={s.statB} style={{ color: '#fff' }}>{b}</span><Caption1 style={{ color: 'rgba(255,255,255,.82)' }}>{l}</Caption1></div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* COMMUNITY */}
          <section id="community" className={s.section}>
            <div className={s.wrap}>
              <div className={s.sectionHead}>
                <Caption1 className={s.eyebrow}>Open source</Caption1>
                <Title3 as="h2" block>Built in the open. Shaped by you.</Title3>
                <Body1 block style={{ color: tokens.colorNeutralForeground2 }}>fluent-ui is MIT licensed. Report bugs, request features, ask questions, and send pull requests. Every contribution is welcome.</Body1>
              </div>
              <div className={s.grid3}>
                {COMMUNITY.map((c) => (
                  <div key={c.t} className={`${glass} ${s.hoverable} ${s.card}`}>
                    <span className={s.ic} style={{ background: tint(c.c), color: c.c }}><c.Icon /></span>
                    <Body1Strong block>{c.t}</Body1Strong>
                    <Body1 block style={{ color: tokens.colorNeutralForeground2, margin: '4px 0 14px' }}>{c.d}</Body1>
                    <Link href={c.href}>{c.cta} <Open16Regular /></Link>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <footer className={s.footer}>
            <div className={`${s.wrap} ${s.footRow}`}>
              <div>
                <span className={s.brand} style={{ marginBottom: 8 }}><span className={s.logo}><Sparkle20Filled /></span> Fluent UI 2.0 Plugin</span>
                <Caption1 block style={{ color: tokens.colorNeutralForeground3, marginTop: 8, maxWidth: '54ch' }}>Built with the Microsoft Fluent 2 design system (Fluent UI React v9). This site is a demo of the plugin's own output. It is not an official Microsoft product.</Caption1>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <Button appearance="secondary" as="a" href={REPO} icon={<Star20Regular />}>GitHub</Button>
                <Button appearance="subtle" as="a" href="https://fluent2.microsoft.design" icon={<Open16Regular />} iconPosition="after">fluent2.microsoft.design</Button>
              </div>
            </div>
            <Divider style={{ marginTop: 22 }} />
          </footer>
        </div>
      </div>
    </FluentProvider>
  );
}
