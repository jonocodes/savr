# Storybook Configuration

This Storybook setup is configured for the tanstack-basic project with Material-UI components.

## Features

- **Material-UI Integration**: All stories are wrapped with MUI's `ThemeProvider` and `CssBaseline`
- **Fullscreen Layout**: ArticleScreen stories use fullscreen layout for better visualization
- **Responsive Testing**: Multiple viewport configurations for mobile, tablet, and desktop
- **Auto-documentation**: Automatic documentation generation for components

## Available Stories

### ArticleScreen Component

- **Default**: Standard article view with all controls
- **ArchivedArticle**: Shows archived state with unarchive button
- **LargeFont**: Demonstrates font size controls
- **MobileView**: Mobile device viewport
- **TabletView**: Tablet device viewport
- **DesktopView**: Desktop device viewport

## Running Storybook

```bash
npm run storybook
```

This will start Storybook on `http://localhost:6006`

## Building Storybook

```bash
npm run build-storybook
```

## Configuration Files

- `main.ts`: Main Storybook configuration
- `preview.ts`: Global decorators and parameters
- `README.md`: This documentation

## Adding New Stories

1. Create a `.stories.tsx` file next to your component
2. Import the component and create story exports
3. Use the `@storybook/react` types for proper TypeScript support
4. Add appropriate parameters for viewport testing if needed
