import { createContext, useContext } from 'react';

export type PostPreview = { type: 'place' | 'social'; id: string };

type PostPreviewContextValue = {
  selected: PostPreview | null;
  open: (post: PostPreview) => boolean;
  revision: number;
  refresh: () => void;
};

// Native and narrow web screens keep the existing navigation behavior.
export const PostPreviewContext = createContext<PostPreviewContextValue>({ selected: null, open: () => false, revision: 0, refresh: () => {} });
export const usePostPreview = () => useContext(PostPreviewContext);
