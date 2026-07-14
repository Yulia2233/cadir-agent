import { create } from 'zustand';

type WorkbenchState = {
  activeConversationId: string | null;
  mobilePanel: 'chat' | 'model';
  selectionMode: 'face' | 'edge';
  selectedEntityIds: string[];
  setActiveConversation: (id: string | null) => void;
  setMobilePanel: (panel: 'chat' | 'model') => void;
  setSelectionMode: (mode: 'face' | 'edge') => void;
  clearSelections: () => void;
};

export const useWorkbench = create<WorkbenchState>((set) => ({
  activeConversationId: null,
  mobilePanel: 'chat',
  selectionMode: 'face',
  selectedEntityIds: [],
  setActiveConversation: (id) => set({ activeConversationId: id, selectedEntityIds: [] }),
  setMobilePanel: (panel) => set({ mobilePanel: panel }),
  setSelectionMode: (mode) => set({ selectionMode: mode, selectedEntityIds: [] }),
  clearSelections: () => set({ selectedEntityIds: [] }),
}));
