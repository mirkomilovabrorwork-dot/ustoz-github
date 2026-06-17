export interface GlassSettings {
	edgeIntensity: number;
	rimIntensity: number;
	baseIntensity: number;
	edgeDistance: number;
	rimDistance: number;
	baseDistance: number;
	cornerBoost: number;
	rippleEffect: number;
	blurRadius: number;
	tintOpacity: number;
}

export const APPLE_PRESET: GlassSettings = {
	edgeIntensity: 0.018,
	rimIntensity: 0.08,
	baseIntensity: 0.012,
	edgeDistance: 0.15,
	rimDistance: 0.8,
	baseDistance: 0.1,
	cornerBoost: 0.03,
	rippleEffect: 0.12,
	blurRadius: 7.0,
	tintOpacity: 0.25,
};

export const SUBTLE_PRESET: GlassSettings = {
	edgeIntensity: 0.008,
	rimIntensity: 0.04,
	baseIntensity: 0.006,
	edgeDistance: 0.2,
	rimDistance: 1.0,
	baseDistance: 0.15,
	cornerBoost: 0.015,
	rippleEffect: 0.05,
	blurRadius: 3.5,
	tintOpacity: 0.15,
};

export const HEAVY_PRESET: GlassSettings = {
	edgeIntensity: 0.045,
	rimIntensity: 0.13,
	baseIntensity: 0.025,
	edgeDistance: 0.1,
	rimDistance: 0.55,
	baseDistance: 0.08,
	cornerBoost: 0.06,
	rippleEffect: 0.25,
	blurRadius: 12.0,
	tintOpacity: 0.4,
};

export const DEFAULT_SETTINGS: GlassSettings = APPLE_PRESET;
