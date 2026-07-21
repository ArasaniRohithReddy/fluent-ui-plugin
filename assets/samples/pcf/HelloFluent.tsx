/*
 * HelloFluent.tsx — a tiny Fluent UI React v9 (Fluent 2) component.
 *
 * A minimal "card" with a Text heading + body and a primary Button. Styling uses Fluent 2
 * *design tokens* via `makeStyles` + `tokens`, so colors/spacing/radii/typography come from
 * the active theme (the one provided by the host through FluentProvider in index.ts).
 *
 * Illustration only — kept intentionally small and dependency-light.
 * Fluent 2 components: https://react.fluentui.dev/  ·  Design tokens: https://fluent2.microsoft.design
 */

import * as React from "react";
import {
  Card,
  CardHeader,
  Button,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";

export interface IHelloFluentCardProps {
  /** Text shown as the card heading and echoed back to the app (bound `label`). */
  label: string;
  /** Number of times the button was clicked (bound `clickCount`). */
  clickCount: number;
  /** Invoked on button click; the control increments clickCount and notifies the platform. */
  onClick: () => void;
}

// Token-based styles: everything references Fluent 2 tokens so the card follows the app theme.
const useStyles = makeStyles({
  card: {
    maxWidth: "320px",
    // Shorthand-free longhands keep this compatible with strict style typings.
    padding: tokens.spacingVerticalL,
    rowGap: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusLarge,
  },
  body: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase300,
  },
});

export const HelloFluentCard: React.FC<IHelloFluentCardProps> = (props) => {
  const styles = useStyles();

  return (
    <Card className={styles.card}>
      <CardHeader
        header={<Text weight="semibold">{props.label}</Text>}
        description={
          <Text className={styles.body}>Styled with Fluent 2 design tokens</Text>
        }
      />

      <Text className={styles.body}>
        You have clicked {props.clickCount} time
        {props.clickCount === 1 ? "" : "s"}.
      </Text>

      <Button appearance="primary" onClick={props.onClick}>
        Click me
      </Button>
    </Card>
  );
};
