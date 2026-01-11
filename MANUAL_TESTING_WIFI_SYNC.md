# Manual Testing Guide: WiFi-Only Sync Feature

This guide explains how to test the WiFi-only sync feature in regular web mode (not PWA) by temporarily modifying the code.

## Setup for Manual Testing

### Step 1: Force PWA Mode Detection

Edit `src/utils/network.ts` and modify the `isPWAMode()` function:

```typescript
// BEFORE (production code):
export function isPWAMode(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }
  if ((window.navigator as any).standalone === true) {
    return true;
  }
  return false;
}

// AFTER (for testing):
export function isPWAMode(): boolean {
  // ⚠️ TESTING ONLY: Force PWA mode to be true
  return true;

  // Original code commented out:
  // if (window.matchMedia('(display-mode: standalone)').matches) {
  //   return true;
  // }
  // if ((window.navigator as any).standalone === true) {
  //   return true;
  // }
  // return false;
}
```

**Result:** The WiFi-only toggle will now appear in preferences, and the sync indicator will show on the article list.

### Step 2: Control WiFi Status via Browser Console

You don't need to modify `isOnWiFi()` - instead, use the browser console to control it dynamically!

#### Option A: Use Browser Console (Recommended)

1. Open browser DevTools (F12)
2. Go to the Console tab
3. Run these commands to control the network type:

```javascript
// Simulate WiFi connection
window.__testNetworkType = 'wifi';

// Simulate cellular connection
window.__testNetworkType = 'cellular';

// Remove override (use real detection)
delete window.__testNetworkType;
```

4. Then modify `isOnWiFi()` in `src/utils/network.ts` to check for this flag:

```typescript
export function isOnWiFi(): boolean {
  // ⚠️ TESTING ONLY: Check for manual override first
  if (typeof window !== 'undefined' && (window as any).__testNetworkType) {
    return (window as any).__testNetworkType === 'wifi';
  }

  // Original code below:
  const connection = (navigator as any).connection ||
                    (navigator as any).mozConnection ||
                    (navigator as any).webkitConnection;

  if (!connection) {
    return true;
  }

  const type = connection.type || connection.effectiveType;

  if (!type) {
    return true;
  }

  if (type === 'wifi' || type === 'ethernet') {
    return true;
  }

  if (type === 'cellular' || type === '2g' || type === '3g' || type === '4g' || type === '5g') {
    return false;
  }

  return true;
}
```

#### Option B: Hard-code Network Type (Simpler but less flexible)

Just return the value you want to test:

```typescript
export function isOnWiFi(): boolean {
  // ⚠️ TESTING ONLY: Simulate cellular connection
  return false; // false = cellular, true = WiFi

  // Original code commented out:
  // const connection = (navigator as any).connection || ...
  // [rest of original code]
}
```

## Testing Scenarios

### Scenario 1: Enable WiFi-Only Sync on WiFi

1. Enable `isPWAMode()` to return `true`
2. In browser console: `window.__testNetworkType = 'wifi'`
3. Refresh the page
4. Enable sync in preferences
5. Enable "Sync only over WiFi" toggle
6. Go to article list
7. **Expected:** Green cloud icon in bottom-left (sync active)

### Scenario 2: Switch to Cellular (Sync Should Pause)

1. With WiFi-only enabled from Scenario 1
2. In browser console: `window.__testNetworkType = 'cellular'`
3. Wait 2-3 seconds (for the interval to detect the change)
4. **Expected:** Icon changes to orange cloud-off (sync paused)
5. Check console logs for: "📴 Sync paused: WiFi-only mode enabled and not on WiFi"

### Scenario 3: Switch Back to WiFi (Sync Should Resume)

1. With cellular from Scenario 2
2. In browser console: `window.__testNetworkType = 'wifi'`
3. Wait 2-3 seconds
4. **Expected:** Icon changes back to green cloud (sync active)
5. Check console logs for: "🔄 Sync active"

### Scenario 4: Disable WiFi-Only Mode

1. Keep any network type
2. Go to preferences
3. Disable "Sync only over WiFi" toggle
4. Go to article list
5. **Expected:** Green cloud icon (sync always active, regardless of network)

### Scenario 5: Verify Indicator Hidden in Web Mode

1. **Revert** `isPWAMode()` to return `false` (original code)
2. Refresh the page
3. **Expected:**
   - WiFi-only toggle hidden in preferences
   - No sync indicator on article list
   - Sync works normally without restrictions

## Console Logs to Watch

Open DevTools Console to see these logs:
- `🔄 Sync active` - When sync is running
- `📴 Sync paused: WiFi-only mode enabled and not on WiFi` - When sync is paused
- `Network change detected, checking sync status...` - When network changes (Option A only)

## Cleanup: Revert Changes

Before committing, **make sure to revert**:

1. `src/utils/network.ts`:
   - Remove `return true;` from `isPWAMode()`
   - Remove `window.__testNetworkType` check from `isOnWiFi()`

2. Or just run: `git checkout src/utils/network.ts`

## Quick Toggle Code Block

For fastest testing, replace the functions with these:

```typescript
// src/utils/network.ts - TESTING VERSION

export function isPWAMode(): boolean {
  return true; // ⚠️ TESTING: Always PWA mode
}

export function isOnWiFi(): boolean {
  // ⚠️ TESTING: Console control with fallback
  if (typeof window !== 'undefined' && (window as any).__testNetworkType) {
    console.log(`🧪 Test mode: Network = ${(window as any).__testNetworkType}`);
    return (window as any).__testNetworkType === 'wifi';
  }

  // Default to WiFi when no override
  console.log('🧪 Test mode: Defaulting to WiFi');
  return true;
}
```

Then use browser console:
```javascript
// Test cellular
window.__testNetworkType = 'cellular';

// Test WiFi
window.__testNetworkType = 'wifi';

// Back to normal
delete window.__testNetworkType;
```
