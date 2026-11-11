type MapAction =
  | { type: 'search'; query?: string }
  | { type: 'route'; query: string };

type MapActionHandler = (action: MapAction) => void;

let currentHandler: MapActionHandler | null = null;
let pendingAction: MapAction | null = null;

export function registerMapSearchHandler(handler: MapActionHandler) {
  currentHandler = handler;
  if (pendingAction) {
    handler(pendingAction);
    pendingAction = null;
  }
  return () => {
    if (currentHandler === handler) {
      currentHandler = null;
    }
  };
}

export function triggerMapSearch(query?: string) {
  triggerMapAction({ type: 'search', query });
}

export function triggerMapRoute(query: string) {
  triggerMapAction({ type: 'route', query });
}

function triggerMapAction(action: MapAction) {
  if (currentHandler) {
    currentHandler(action);
  } else {
    pendingAction = action;
  }
}
