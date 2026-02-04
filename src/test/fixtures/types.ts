/**
 * Types for the composable test fixture system.
 *
 * This module provides type definitions used by TestFixture and related
 * builders for setting up test scenarios.
 */

import type { Engine } from '../../engine/Engine';
import type { PanelPath } from '../../types';
import type { EngineAction } from '../../engine/types';

/**
 * Result of building a test fixture.
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
 * Operations are collected during fixture configuration and executed
 * when build() is called.
 */
export interface QueuedOperation {
  /** The engine action to dispatch */
  action: EngineAction;
}
