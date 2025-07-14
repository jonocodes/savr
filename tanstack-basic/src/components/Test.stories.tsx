import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@mui/material";

const meta: Meta<typeof Button> = {
  title: "Test/Button",
  component: Button,
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    children: "Test Button",
    variant: "contained",
  },
};
