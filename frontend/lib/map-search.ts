type MapAction =
  | { type: 'search'; query?: string; postId?: string }
  | { type: 'route'; query: string; postId?: string };

type MapActionHandler = (action: MapAction) => boolean;

let currentHandler: MapActionHandler | null = null;
let pendingAction: MapAction | null = null;

export function registerMapSearchHandler(handler: MapActionHandler) {
  currentHandler = handler;
  if (pendingAction && handler(pendingAction)) pendingAction = null;
  return () => {
    if (currentHandler === handler) {
      currentHandler = null;
    }
  };
}

export function triggerMapSearch(query?: string, postId?: string) {
  triggerMapAction({ type: 'search', query, postId });
}

export function triggerMapRoute(query: string, postId?: string) {
  triggerMapAction({ type: 'route', query, postId });
}

function triggerMapAction(action: MapAction) {
  if (!currentHandler?.(action)) pendingAction = action;
}
