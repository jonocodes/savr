// @ts-ignore
import type { Preview } from "@storybook/react-vite";
import React from "react";
import { CssBaseline } from "@mui/material";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    (Story) => {
      const router = createRouter({
        history: createMemoryHistory(),
        routeTree: createRootRoute({
          component: Story,
        }),
      });
      return <RouterProvider router={router} />;
    },

    // (Story) => (
    //   <ThemeProvider theme={theme}>
    //     <CssBaseline />
    //     <Story />
    //   </ThemeProvider>
    // ),
  ],
};

export default preview;
