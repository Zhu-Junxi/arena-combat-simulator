// Sample once per attack so the charge and released star share one launch point.
export function createStarLaunch(rules, random = Math.random) {
  const rearOffset = (random() * 2 - 1) * Math.PI / 7;
  return { rearOffset, side: rearOffset < 0 ? -1 : 1,
    orbitRadius: rules.fighterSize * (1.15 + random() * 0.3),
    arcAngle: Math.PI / 2 - Math.abs(rearOffset) };
}

export function createStarFlight(owner, target, rules, launch = createStarLaunch(rules)) {
  const facing = Math.atan2(target.y - owner.y, target.x - owner.x);
  const { orbitRadius, rearOffset, side } = launch;
  const startAngle = facing + Math.PI - rearOffset;
  const baseSpeed = Math.max(1, owner.projectileSpeed * rules.projectileSpeedScale);
  return {
    ...launch, phase: 'flank', facing, startAngle, arcDistance: 0,
    speed: baseSpeed * 0.2, acceleration: baseSpeed * 2.4,
    x: owner.x + Math.cos(startAngle) * orbitRadius,
    y: owner.y + Math.sin(startAngle) * orbitRadius,
    angle: startAngle - side * Math.PI / 2
  };
}

export function advanceStarFlight(projectile, seconds) {
  const flight = projectile.starFlight;
  const owner = projectile.owner;
  const target = projectile.target;
  let remaining = seconds;
  let elapsed = 0;
  if (flight.phase === 'flank') {
    const arcRemaining = Math.max(0, flight.orbitRadius * flight.arcAngle - flight.arcDistance);
    const timeToSide = 2 * arcRemaining / (Math.sqrt(flight.speed ** 2 + 2 * flight.acceleration * arcRemaining) + flight.speed);
    const step = Math.min(remaining, timeToSide);
    flight.arcDistance += flight.speed * step + 0.5 * flight.acceleration * step ** 2;
    flight.speed += flight.acceleration * step;
    const theta = Math.min(flight.arcAngle, flight.arcDistance / flight.orbitRadius);
    const angle = flight.startAngle - flight.side * theta;
    const fraction = seconds > 0 ? step / seconds : 1;
    const centerX = owner.prevX + (owner.x - owner.prevX) * fraction;
    const centerY = owner.prevY + (owner.y - owner.prevY) * fraction;
    projectile.x = centerX + Math.cos(angle) * flight.orbitRadius;
    projectile.y = centerY + Math.sin(angle) * flight.orbitRadius;
    projectile.angle = angle - flight.side * Math.PI / 2;
    remaining -= step;
    elapsed += step;
    if (step >= timeToSide - 1e-9) {
      flight.phase = 'flying';
      const targetX = target.prevX + (target.x - target.prevX) * fraction;
      const targetY = target.prevY + (target.y - target.prevY) * fraction;
      projectile.angle = Math.atan2(targetY - projectile.y, targetX - projectile.x);
    }
  }
  let segment = null;
  if (flight.phase === 'flying' && remaining > 0) {
    const x = projectile.x;
    const y = projectile.y;
    const distance = flight.speed * remaining + 0.5 * flight.acceleration * remaining ** 2;
    projectile.x += Math.cos(projectile.angle) * distance;
    projectile.y += Math.sin(projectile.angle) * distance;
    flight.speed += flight.acceleration * remaining;
    segment = { x, y, nextX: projectile.x, nextY: projectile.y, startFraction: elapsed / seconds };
  }
  projectile.vx = Math.cos(projectile.angle) * flight.speed;
  projectile.vy = Math.sin(projectile.angle) * flight.speed;
  return segment;
}
