// ECMAScript Modules
// 
let NOW = () => Date.now();
if (typeof self === 'undefined' && typeof process !== 'undefined' && process.hrtime) {
    NOW = () => {
        const t = process.hrtime();
        return t[0] * 1000 + t[1] / 1e6;
    };
} else if (typeof self !== 'undefined' && self.performance && self.performance.now) {
    NOW = self.performance.now.bind(self.performance);
}

let SEQ_SYSTEM = 1;
let SEQ_ENTITY = 1;
let SEQ_COMPONENT = 1;

// ────────────────────── Iterator ────────────────────── 
export class Iterator {
    constructor(nextFn) {
        this.cache = [];
        this.index = 0;
        this.done = false;
        this.nextFn = nextFn;
    }
    each(cb) {
        while (true) {
            if (this.index < this.cache.length) {
                const value = this.cache[this.index++];
                if (cb(value) === false) break;
                continue;
            }
            if (this.done) break;
            const value = this.nextFn();
            if (value === undefined) {
                this.done = true;
                break;
            }
            this.cache.push(value);
            if (cb(value) === false) break;
        }
    }
    find(predicate) {
        let result;
        this.each(item => {
            if (predicate(item)) {
                result = item;
                return false;
            }
        });
        return result;
    }
    filter(predicate) {
        const out = [];
        this.each(item => predicate(item) && out.push(item));
        return out;
    }
    map(fn) {
        const out = [];
        this.each(item => out.push(fn(item)));
        return out;
    }
}

// ────────────────────── Entity ──────────────────────
export class Entity {
    constructor() {
        this.id = SEQ_ENTITY++;
        this.active = true;
        this.components = {};       // typeId → Component[]
        this.subscriptions = [];
    }

    subscribe(fn) {
        this.subscriptions.push(fn);
        return () => this.subscriptions.splice(this.subscriptions.indexOf(fn), 1);
    }

    // helpers
    has(...components) {
        return components.every(C => C.allFrom(this).length > 0);
    }

    add(component) {
        const t = component.type;
        if (!this.components[t]) this.components[t] = [];
        if (this.components[t].includes(component)) return;
        this.components[t].push(component);
        this.subscriptions.forEach(cb => cb(this, component, undefined));
    }
    remove(component) {
        const t = component.type;
        const list = this.components[t];
        if (!list) return;
        const i = list.indexOf(component);
        if (i === -1) return;
        list.splice(i, 1);
        if (list.length === 0) delete this.components[t];
        this.subscriptions.forEach(cb => cb(this, undefined, component));
    }
}

// ────────────────────── Component ──────────────────────
// decorator
//---
// @Component
// class Position{
//     static defaults = { x: 0, y: 0 };
// }

// Auto-register decorator + helper
export function Component(target) {
    const type = SEQ_COMPONENT++;

    // Attach all the statics you need
    target.type = type;

    target.allFrom = (entity) => entity.components[type] || [];
    target.oneFrom = (entity) => target.allFrom(entity)[0] || null;

    // Best UX ever
    target.add = (entity, data = {}) => {
        const comp = new target(data);
        const list = (entity.components[type] ??= []);
        if (!list.includes(comp)) {
            list.push(comp);
            entity.subscriptions.forEach(fn => fn(entity, comp, null));
        }
        return comp;
    };

    target.remove = (entity, instance) => {
        const list = entity.components[type];
        if (!list) return;
        const i = list.indexOf(instance);
        if (i === -1) return;
        list.splice(i, 1);
        if (list.length === 0) delete entity.components[type];
        entity.subscriptions.forEach(fn => fn(entity, null, instance));
    };

    // Override the constructor to inject .data and .attr
    const originalCtor = target;
    function WrappedComponent(overrideData = {}) {
        this.type = type;
        this.data = { ...originalCtor.defaults, ...overrideData };
        this.attr = {};
    }

    // Copy prototype
    Object.setPrototypeOf(WrappedComponent.prototype, originalCtor.prototype);
    WrappedComponent.prototype.constructor = WrappedComponent;

    // Transfer all statics we added
    Object.assign(WrappedComponent, originalCtor, {
        type,
        allFrom: target.allFrom,
        oneFrom: target.oneFrom,
        add: target.add,
        remove: target.remove,
        // Keep name!
        name: originalCtor.name
    });

    // This is the magic: store defaults on the class
    WrappedComponent.defaults = originalCtor.defaults || {};

    return WrappedComponent;
}

// ────────────────────── defineComponent ──────────────────────
// manual register if you hate decorators
export function defineComponent(fields = {}) {
    const type = SEQ_COMPONENT++;

    class ComponentClass {
        static type = type;
        static allFrom(e) { return e.components[type] || []; }
        static oneFrom(e) { return ComponentClass.allFrom(e)[0] || null; }

        constructor(data = {}) {
            this.type = type;
            this.data = { ...fields, ...data };  // ← preserves your .data!
            this.attr = {};
        }

        // Optional helpers
        static add(entity, data = {}) {
            const comp = new this(data);
            (entity.components[type] ??= []).push(comp);
            entity.subscriptions.forEach(cb => cb(entity, comp, null));
            return comp;
        }

        static remove(entity, comp) {
            const list = entity.components[type];
            if (!list) return;
            const i = list.indexOf(comp);
            if (i === -1) return;
            list.splice(i, 1);
            if (list.length === 0) delete entity.components[type];
            entity.subscriptions.forEach(cb => cb(entity, null, comp));
        }
    }

    return ComponentClass;
}

/* ────────────────────── System ────────────────────── */
export class System {
    constructor(componentTypes = [], frequence = 0) {
        this.id = SEQ_SYSTEM++;
        this.componentTypes = componentTypes;   // <-- always an array
        this.frequence = frequence;
        this.callbacks = {};
        this.world = null;
        this.trigger = null;
    }
    query(types) { return this.world.query(types); }
    listenTo(event, cb, once = false) {
        if (!this.callbacks[event]) this.callbacks[event] = [];
        if (once) {
            const orig = cb;
            cb = (...args) => {
                orig.apply(this, args);
                const i = this.callbacks[event].indexOf(cb);
                if (i > -1) this.callbacks[event].splice(i, 1);
            };
        }
        this.callbacks[event].push(cb);
    }
    update(dt, gameTime, entity) { /* override */ }
    enter(entity) {}
    exit(entity) {}
    change(entity, added, removed) {}
}

/* ────────────────────── ECS (World) ────────────────────── */
class ECS {
    static System = System;
    static Entity = Entity;
    static Component = Component;

    constructor(systems = []) {
        this.systems = [];
        this.entities = [];
        this.entitySystems = {};            // entity.id → System[]
        this.lastUpdateReal = {};           // entity.id → {system.id → timestamp}
        this.lastUpdateGame = {};           // entity.id → {system.id → timestamp}
        this.subscriptions = {};            // entity.id → unsubscribe fn
        this.timeScale = 1;
        this.lastFrame = NOW();
        this.gameTime = 0;

        this.trigger = (event, data) => {
            this.systems.forEach(sys => {
                const cbs = sys.callbacks[event];
                if (cbs && cbs.length) {
                    this._inject(sys);
                    const it = this.query(sys.componentTypes);
                    cbs.forEach(cb => cb(data, it));
                }
            });
        };

        systems.forEach(s => this.addSystem(s));
    }

    destroy() {
        [...this.entities].forEach(e => this.removeEntity(e));
        [...this.systems].forEach(s => this.removeSystem(s));
    }

    getEntity(id) { return this.entities.find(e => e.id === id); }

    addEntity(entity) {
        if (!entity || this.entities.includes(entity)) return;
        this.entities.push(entity);

        // initialise containers
        this.entitySystems[entity.id] = [];
        this.lastUpdateReal[entity.id] = {};
        this.lastUpdateGame[entity.id] = {};

        // subscribe to component changes
        if (this.subscriptions[entity.id]) this.subscriptions[entity.id]();
        this.subscriptions[entity.id] = entity.subscribe((e, added, removed) => {
            this._onComponentChange(e, added, removed);
            this._reindexEntity(e);
        });

        this._reindexEntity(entity);
    }

    removeEntity(idOrEntity) {
        const entity = typeof idOrEntity === 'number' ? this.getEntity(idOrEntity) : idOrEntity;
        if (!entity) return;

        const idx = this.entities.indexOf(entity);
        if (idx > -1) this.entities.splice(idx, 1);

        if (this.subscriptions[entity.id]) {
            this.subscriptions[entity.id]();
            delete this.subscriptions[entity.id];
        }

        const systems = this.entitySystems[entity.id] || [];
        systems.forEach(sys => sys.exit && this._inject(sys) && sys.exit(entity));

        delete this.entitySystems[entity.id];
        delete this.lastUpdateReal[entity.id];
        delete this.lastUpdateGame[entity.id];
    }

    addSystem(system) {
        if (!system || this.systems.includes(system)) return;
        this.systems.push(system);
        this.entities.forEach(e => this._indexEntitySystem(e, system));
    }

    removeSystem(system) {
        const i = this.systems.indexOf(system);
        if (i === -1) return;

        this.entities.forEach(e => {
            const list = this.entitySystems[e.id];
            if (list && list.includes(system)) {
                if (system.exit) this._inject(system), system.exit(e);
                const pos = list.indexOf(system);
                list.splice(pos, 1);
            }
        });

        this.systems.splice(i, 1);
        system.world = system.trigger = null;
    }

    query(requiredTypes = []) {
        const wantsAll = requiredTypes.includes(-1);
        let index = 0;

        return new Iterator(() => {
            while (index < this.entities.length) {
                const e = this.entities[index++];
                if (!e.active && !wantsAll) continue;
                if (wantsAll) return e;

                const hasAll = requiredTypes.every(t =>
                    t === -1 || (e.components[t] && e.components[t].length > 0)
                );
                if (hasAll) return e;
            }
            return undefined;
        });
    }

    update() {
        const now = NOW();
        this.gameTime += (now - this.lastFrame) * this.timeScale;
        this.lastFrame = now;

        const afterGroups = {};

        this.entities.forEach(entity => {
            if (!entity.active) { this.removeEntity(entity); return; }

            const systems = this.entitySystems[entity.id] || [];
            const realTimes = this.lastUpdateReal[entity.id] || {};
            const gameTimes = this.lastUpdateGame[entity.id] || {};

            systems.forEach(sys => {
                if (!sys.update) return;
                this._inject(sys);

                let realElapsed = now - (realTimes[sys.id] || 0);
                const gameElapsed = this.gameTime - (gameTimes[sys.id] || 0);

                if (sys.frequence > 0) {
                    const interval = 1000 / sys.frequence;
                    if (realElapsed < interval) return;
                    realElapsed %= interval;
                }

                realTimes[sys.id] = now - realElapsed;
                gameTimes[sys.id] = this.gameTime;

                const key = `_${sys.id}`;
                if (!afterGroups[key]) {
                    if (sys.beforeUpdateAll) sys.beforeUpdateAll(this.gameTime);
                    afterGroups[key] = { sys, entities: [] };
                }
                afterGroups[key].entities.push(entity);

                sys.update(this.gameTime, gameElapsed, entity);
            });
        });

        Object.values(afterGroups).forEach(g => {
            if (g.sys.afterUpdateAll) {
                this._inject(g.sys);
                g.sys.afterUpdateAll(this.gameTime, g.entities);
            }
        });
    }

    _inject(sys) {
        sys.world = this;
        sys.trigger = this.trigger;
        return sys;
    }

    _onComponentChange(entity, added, removed) {
        const list = [...(this.entitySystems[entity.id] || [])];
        for (let i = list.length - 1; i >= 0; i--) {
            const sys = list[i];
            if (!sys.change) continue;
            const types = sys.componentTypes || [];
            if (types.includes(-1)) continue;
            const relevant = (added && types.includes(added.type)) ||
                            (removed && types.includes(removed.type));
            if (!relevant) list.splice(i, 1);
        }
        list.forEach(sys => {
            if (typeof sys.change !== 'function') return;  // if none skip
            this._inject(sys);
            const types = sys.componentTypes || [];
            const all = types.includes(-1);
            sys.change(
                entity,
                all || (added && types.includes(added.type)) ? added : undefined,
                all || (removed && types.includes(removed.type)) ? removed : undefined
            );
        });
    }

    _indexEntitySystem(entity, system) {
        if (!this.entitySystems[entity.id]) this.entitySystems[entity.id] = [];

        const list = this.entitySystems[entity.id];
        const already = list.includes(system);
        const inWorld = this.systems.includes(system);

        // system no longer in world → remove
        if (!inWorld) {
            if (already) {
                const i = list.indexOf(system);
                list.splice(i, 1);
                delete this.lastUpdateReal[entity.id][system.id];
                delete this.lastUpdateGame[entity.id][system.id];
            }
            return;
        }

        const required = system.componentTypes || [];
        const hasAll = required.length === 0 || required.every(t =>
            t === -1 || (entity.components[t] && entity.components[t].length > 0)
        );

        if (hasAll && !already) {
            list.push(system);
            this.lastUpdateReal[entity.id][system.id] = NOW();
            this.lastUpdateGame[entity.id][system.id] = this.gameTime;
            if (system.enter) this._inject(system), system.enter(entity);
        } else if (!hasAll && already) {
            const i = list.indexOf(system);
            list.splice(i, 1);
            delete this.lastUpdateReal[entity.id][system.id];
            delete this.lastUpdateGame[entity.id][system.id];
            if (system.exit) this._inject(system), system.exit(entity);
        }
    }

    _reindexEntity(entity) {
        this.systems.forEach(sys => this._indexEntitySystem(entity, sys));
    }
}

/* ────────────────────── Export ────────────────────── */
export default ECS;
export { 
    ECS, 
    // System, 
    // Entity, 
    // Component, 
    // Iterator 
};