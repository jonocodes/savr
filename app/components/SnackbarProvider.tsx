// SnackbarContext.tsx
import React, { createContext, useContext, useState } from 'react';
import { Snackbar, Provider as PaperProvider } from 'react-native-paper';

interface SnackbarContextValue {
  showMessage: (message: string, isError?: boolean) => void;
}

const SnackbarContext = createContext<SnackbarContextValue | undefined>(undefined);

export const SnackbarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const showMessage = (msg: string, error: boolean = false) => {
    setMessage(msg);
    setIsError(error);
    setVisible(true);
  };

  return (
    <SnackbarContext.Provider value={{ showMessage }}>
      <PaperProvider>
        {children}
        <Snackbar
          visible={visible}
          onDismiss={() => setVisible(false)}
          duration={3000}
          style={{ backgroundColor: isError ? 'red' : 'green' }}
        >
          {message}
        </Snackbar>
      </PaperProvider>
    </SnackbarContext.Provider>
  );
};

export const useSnackbar = (): SnackbarContextValue => {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error('useSnackbar must be used within a SnackbarProvider');
  }
  return context;
};
