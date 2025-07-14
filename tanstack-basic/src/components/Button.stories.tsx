import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@mui/material";

const meta: Meta<typeof Button> = {
  title: "Components/Button",
  component: Button,
  parameters: {
    docs: {
      description: {
        component: "Material-UI Button component with various variants and colors.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["text", "outlined", "contained"],
    },
    color: {
      control: { type: "select" },
      options: ["primary", "secondary", "error", "info", "success", "warning"],
    },
    size: {
      control: { type: "select" },
      options: ["small", "medium", "large"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    variant: "contained",
    color: "primary",
    children: "Primary Button",
  },
};

export const Secondary: Story = {
  args: {
    variant: "contained",
    color: "secondary",
    children: "Secondary Button",
  },
};

export const Outlined: Story = {
  args: {
    variant: "outlined",
    children: "Outlined Button",
  },
};

export const Text: Story = {
  args: {
    variant: "text",
    children: "Text Button",
  },
};

export const Large: Story = {
  args: {
    size: "large",
    variant: "contained",
    children: "Large Button",
  },
};

export const Small: Story = {
  args: {
    size: "small",
    variant: "contained",
    children: "Small Button",
  },
};
