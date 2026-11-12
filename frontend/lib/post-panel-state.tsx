import { createContext, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

type State = { visible: boolean; setVisible: Dispatch<SetStateAction<boolean>> };
const Context = createContext<State | null>(null);

export function PostPanelStateProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const value = useMemo(() => ({ visible, setVisible }), [visible]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePostPanelState() {
  const value = useContext(Context);
  if (!value) throw new Error('PostPanelStateProvider is missing');
  return value;
}
