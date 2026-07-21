// App.tsx — minimal, real Fluent 2 (React v9) app: FluentProvider + a themed form
// using Card, Field, Input, Textarea, Switch and Button, styled with Griffel + tokens.
// Grounded against @fluentui/react-components@9.74.3.
import * as React from 'react';
import {
  FluentProvider,
  makeStyles,
  tokens,
  shorthands,
  Card,
  CardHeader,
  Field,
  Input,
  Textarea,
  Button,
  Switch,
  Text,
  Title3,
  Caption1,
} from '@fluentui/react-components';
import { SaveRegular } from '@fluentui/react-icons';
import { lightTheme, darkTheme } from './theme';

const useStyles = makeStyles({
  page: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXXL, // 32px
    backgroundColor: tokens.colorNeutralBackground2,
  },
  card: {
    width: '360px',
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalM, // 12px
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    columnGap: tokens.spacingHorizontalS, // 8px
    marginTop: tokens.spacingVerticalS,
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'flex-end',
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
  },
});

function ContactForm() {
  const styles = useStyles();
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');

  return (
    <Card className={styles.card}>
      <CardHeader
        header={<Title3>Contact us</Title3>}
        description={<Caption1>We usually reply within a day.</Caption1>}
      />

      <Field label="Name" required>
        <Input value={name} onChange={(_, d) => setName(d.value)} placeholder="Ada Lovelace" />
      </Field>

      <Field label="Email" required>
        <Input type="email" value={email} onChange={(_, d) => setEmail(d.value)} placeholder="ada@contoso.com" />
      </Field>

      <Field label="Message">
        <Textarea resize="vertical" placeholder="How can we help?" />
      </Field>

      <div className={styles.actions}>
        <Button appearance="secondary">Cancel</Button>
        <Button appearance="primary" icon={<SaveRegular />} disabled={!name || !email}>
          Send
        </Button>
      </div>
    </Card>
  );
}

export default function App() {
  const styles = useStyles();
  const [dark, setDark] = React.useState(false);

  return (
    <FluentProvider theme={dark ? darkTheme : lightTheme}>
      <div className={styles.toolbar}>
        <Switch
          label="Dark mode"
          checked={dark}
          onChange={(_, d) => setDark(!!d.checked)}
        />
      </div>
      <div className={styles.page}>
        <ContactForm />
      </div>
      <Text align="center" block size={200}>
        Built with Microsoft Fluent 2 (Fluent UI React v9)
      </Text>
    </FluentProvider>
  );
}
