/**
 * Types for the composable assembly builder system.
 *
 * This module provides type definitions used by AssemblyBuilder and related
 * builders for setting up assembly scenarios.
 */

import type { Engine } from '../engine/Engine';
import type { PanelPath } from '../types';
import type { EngineAction } from '../engine/types';

/**
 * Result of building an assembly.
 * Contains the engine, generated panels, and optionally a selected panel.
 */
export interface FixtureResult {
  /** The configured engine instance */
  engine: Engine;
  /** All panels generated from the engine state */
  panels: PanelPath[];
  /** The selected panel, if any (from .panel() selection) */
  panel?: PanelPath;
}

/**
 * An operation queued for lazy execution.
 * Operations are collected during builder configuration and executed
 * when build() is called.
 */
export interface QueuedOperation {
  /** The engine action to dispatch */
  action: EngineAction;
}
