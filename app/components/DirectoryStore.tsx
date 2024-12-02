import create from 'zustand';

interface DirectoryState {
  directoryUri: string | null;
  setDirectoryUri: (uri: string | null) => void;
}

const useDirectoryStore = create<DirectoryState>((set: string) => ({
  directoryUri: null,
  setDirectoryUri: (uri : string) => set({ directoryUri: uri }),
}));
