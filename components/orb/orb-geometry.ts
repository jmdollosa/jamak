// Orb space is measured in sphere radii: the sphere has radius ~1 at the centre.

/** Half-width of the orb pass: room for the halo, ripples and speech waveforms. */
export const ORB_EXTENT = 2.4;

/** Half-width of the whole canvas: extra room for particles bursting outwards. */
export const CANVAS_EXTENT = 3.4;

/** Particles in the cloud around the orb (inspired by Nate Wiley's "Particle Orb CSS"). */
export const PARTICLE_COUNT = 300;

/** Seconds for one emerge → hold → disperse cycle at normal speed. */
export const PARTICLE_CYCLE_SECONDS = 14;

/** Sprite diameter of an average particle, including its soft glow. */
export const PARTICLE_SPRITE = 0.05;
