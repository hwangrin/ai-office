/**
 * Work state controls scene behavior only. It never infers Javis status from position.
 * Idle is allowed to use existing leisure behavior only when its source is authoritative;
 * partial registered-Jobs data projects empty states as Unknown instead.
 */
const STATION = Object.freeze({ returnToWorkstation: true, activeWorkPose: false, allowLeisure: false, neutral: false });
const WORKING = Object.freeze({ returnToWorkstation: true, activeWorkPose: true, allowLeisure: false, neutral: false });
const AVAILABLE = Object.freeze({ returnToWorkstation: false, activeWorkPose: false, allowLeisure: true, neutral: false });
const UNKNOWN = Object.freeze({ returnToWorkstation: false, activeWorkPose: false, allowLeisure: true, neutral: true });
const BEHAVIOR = Object.freeze({
  working: WORKING,
  waiting: STATION,
  input: STATION,
  queued: STATION,
  approval_pending: STATION,
  needs_input: STATION,
  needs_you: STATION,
  idle: AVAILABLE,
  unknown: UNKNOWN,
});

export function sceneBehaviorForStatus(status) {
  return BEHAVIOR[typeof status === 'string' ? status : 'unknown'] ?? UNKNOWN;
}

/** Apply a changed source status and dispatch the existing workstation/home routes when required. */
export function applySceneStatus(visual, status, goToWorkstation, goHome) {
  const previousStatus = visual.status;
  visual.status = status;
  const behavior = sceneBehaviorForStatus(status);
  const station = visual.workstation ?? (!visual.workstationUnavailable && visual.home?.variant === 'desk' ? visual.home : null);
  const enRouteAwayFromStation = visual.where === 'going' || visual.where === 'leisure' || !!visual.person.trip;
  const atWorkstation = !!station && visual.currentSeat === station && !enRouteAwayFromStation;

  // When no physical desk is available, preserve the real status indicator but use a neutral pose.
  visual.person.setStatus(behavior.returnToWorkstation && visual.workstationUnavailable ? 'unknown' : status);

  if (behavior.returnToWorkstation) {
    if (station && !atWorkstation) goToWorkstation(visual, false);
    else if (!station && !visual.workstationUnavailable && visual.where !== 'home' && visual.where !== 'returning') goToWorkstation(visual, false);
    else if (atWorkstation) visual.where = station === visual.home ? 'home' : 'atWorkstation';
  } else if (sceneBehaviorForStatus(previousStatus).returnToWorkstation && station) {
    const leavingTemporaryWorkstation = station !== visual.home &&
      (atWorkstation || visual.where === 'toWorkstation' || visual.person.trip?.seat === station);
    if (leavingTemporaryWorkstation) goHome?.(visual, false);
    else if (station === visual.home && atWorkstation) visual.where = 'home';
  }
  return behavior;
}
