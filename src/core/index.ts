/** Public surface of the pure core. Adapters import from here only. */
export { createPathFilter, type PathFilter } from './pathFilter';
export { isSameOrDescendant, rebase, toRelPath, type RelPath } from './paths';
export {
  deserialize,
  serialize,
  serializeBaseline,
  STATE_VERSION,
  type DeserializeResult,
  type PersistedStateV1,
} from './serialization';
export { initialState, isKnown, reduce, type TrackingEvent, type TrackingState } from './state';
export { Tracker, type LiveEvent, type TrackerPorts, type Unsubscribe } from './tracker';
