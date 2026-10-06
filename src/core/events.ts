export type EventCallback<T = any> = (payload: T) => void;

export interface SectionChangeEvent {
    sectionIndex: number;
    sectionId: string;
    isHome: boolean;
    progress: number;
}

export interface ResizeEvent {
    width: number;
    height: number;
    dpr: number;
}

export interface ScrollEvent {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
    progress: number;
}

export class EventBus {
    private static _instance: EventBus | null = null;
    private _listeners = new Map<string, Set<EventCallback>>();

    static get(): EventBus {
        if (!EventBus._instance) {
            EventBus._instance = new EventBus();
        }
        return EventBus._instance;
    }

    on<T = any>(event: string, callback: EventCallback<T>): () => void {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event)!.add(callback);
        return () => this.off(event, callback);
    }

    off<T = any>(event: string, callback: EventCallback<T>): void {
        const set = this._listeners.get(event);
        if (set) {
            set.delete(callback);
            if (set.size === 0) {
                this._listeners.delete(event);
            }
        }
    }

    emit<T = any>(event: string, payload: T): void {
        const set = this._listeners.get(event);
        if (set) {
            for (const cb of set) {
                cb(payload);
            }
        }
    }
}
