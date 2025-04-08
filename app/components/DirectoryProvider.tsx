// DirectoryContext.tsx
import React, { createContext, useState } from 'react';

const DirectoryContext = createContext({
  directoryUri: null,
  setDirectoryUri: () => {}, // Define the setDirectoryUri function
  permissions: null,
  setPermissions: () => {}, // Define the setPermissions function
});

interface DirectoryProviderProps {
    children: React.ReactNode;
}

const DirectoryProvider = ({ children }: DirectoryProviderProps) => {
  const [directoryUri, setDirectoryUri] = useState(null);
  const [permissions, setPermissions] = useState(null);

  return (
    <DirectoryContext.Provider value={{ directoryUri, setDirectoryUri, permissions, setPermissions }}>
      {children}
    </DirectoryContext.Provider>
  );
};

export { DirectoryProvider, DirectoryContext };
