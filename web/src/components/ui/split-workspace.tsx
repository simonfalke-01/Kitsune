'use client';

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  type RefObject,
  type ReactNode,
  type UIEventHandler,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore
} from 'react';
import { animate, useReducedMotion } from 'motion/react';
import { Slider, SliderOutput, SliderThumb, SliderTrack } from 'react-aria-components';

import { cx } from './styles';

const splitWorkspaceAppearances = {
  contained: 'overflow-hidden rounded-lg border border-border-subtle bg-surface-raised',
  edge: 'overflow-hidden border-y border-border-subtle bg-surface-raised',
  workspace: 'overflow-hidden rounded-md bg-surface-raised'
} as const;

interface SplitWorkspaceStyle extends CSSProperties {
  '--split-workspace-left'?: string;
}

function splitWorkspaceMotion(element: HTMLElement) {
  const computed = window.getComputedStyle(element);
  const damping = Number.parseFloat(computed.getPropertyValue('--motion-split-damping'));
  const mass = Number.parseFloat(computed.getPropertyValue('--motion-split-mass'));
  const stiffness = Number.parseFloat(computed.getPropertyValue('--motion-split-stiffness'));

  return {
    ...(Number.isFinite(damping) ? { damping } : {}),
    ...(Number.isFinite(mass) ? { mass } : {}),
    ...(Number.isFinite(stiffness) ? { stiffness } : {}),
    type: 'spring' as const
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

const splitWorkspacePersistenceEvent = 'kitsune-split-workspace-preference';
const splitWorkspacePersistenceVersion = 'v1';
const splitWorkspaceServerSnapshot = '__kitsune_split_workspace_server__';
const splitWorkspacePreferenceKeyPattern = /^[a-z0-9-]+$/;

function subscribeToSplitWorkspacePreference(change: () => void): () => void {
  window.addEventListener('storage', change);
  window.addEventListener(splitWorkspacePersistenceEvent, change);

  return () => {
    window.removeEventListener('storage', change);
    window.removeEventListener(splitWorkspacePersistenceEvent, change);
  };
}

function splitWorkspaceStorageKey(key: string): string {
  return `kitsune.split-workspace.${splitWorkspacePersistenceVersion}.${key}`;
}

function splitWorkspacePreferenceSnapshot(key?: string): string {
  if (!key) {
    return '';
  }

  try {
    return window.localStorage.getItem(splitWorkspaceStorageKey(key)) ?? '';
  } catch {
    return '';
  }
}

function getServerSplitWorkspacePreferenceSnapshot(): string {
  return splitWorkspaceServerSnapshot;
}

function splitWorkspacePreferenceProperty(key?: string): string | undefined {
  if (!key || !splitWorkspacePreferenceKeyPattern.test(key)) {
    return undefined;
  }

  return `--split-workspace-preference-${key}`;
}

interface UncontrolledSplitState {
  persistenceSnapshot: string;
  value: number;
}

interface ScrollPaneProps {
  children: ReactNode;
  className?: string;
  isScrollable?: boolean;
  onScroll?: UIEventHandler<HTMLDivElement>;
  scrollRef?: RefObject<HTMLDivElement | null>;
}

function ScrollPane({
  children,
  className,
  isScrollable = true,
  onScroll,
  scrollRef
}: ScrollPaneProps) {
  return (
    <div
      className={cx(
        'kitsune-scroll-region relative min-h-0 min-w-0',
        isScrollable ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden',
        className
      )}
      onScroll={onScroll}
      ref={scrollRef}
    >
      {children}
    </div>
  );
}

export interface SplitWorkspaceProps {
  appearance?: keyof typeof splitWorkspaceAppearances;
  ariaLabel: string;
  className?: string;
  collapsedLeft?: ReactNode;
  defaultValue?: number;
  isLeftCollapsed?: boolean;
  left: ReactNode;
  leftScrollRef?: RefObject<HTMLDivElement | null>;
  maximum?: number;
  minimum?: number;
  onLeftScroll?: UIEventHandler<HTMLDivElement>;
  onValueChange?: (value: number) => void;
  persistenceKey?: string;
  right: ReactNode;
  value?: number;
  workspaceHandleRef?: Ref<SplitWorkspaceHandle>;
}

export interface SplitWorkspaceHandle {
  adjustBy: (amount: number) => void;
}

export function SplitWorkspace({
  appearance = 'contained',
  ariaLabel,
  className,
  collapsedLeft,
  defaultValue = 40,
  isLeftCollapsed = false,
  left,
  leftScrollRef,
  maximum = 52,
  minimum = 32,
  onLeftScroll,
  onValueChange,
  persistenceKey,
  right,
  value,
  workspaceHandleRef
}: SplitWorkspaceProps) {
  const getPersistenceSnapshot = useCallback(
    () => splitWorkspacePreferenceSnapshot(persistenceKey),
    [persistenceKey]
  );
  const persistenceSnapshot = useSyncExternalStore(
    subscribeToSplitWorkspacePreference,
    getPersistenceSnapshot,
    getServerSplitWorkspacePreferenceSnapshot
  );
  const [uncontrolledState, setUncontrolledState] = useState<UncontrolledSplitState>({
    persistenceSnapshot: splitWorkspaceServerSnapshot,
    value: defaultValue
  });
  const [isDragging, setIsDragging] = useState(false);
  const [renderedCollapsed, setRenderedCollapsed] = useState(isLeftCollapsed);
  const shouldReduceMotion = useReducedMotion();
  const activePointerRef = useRef<number | null>(null);
  const collapseAnimationRef = useRef<ReturnType<typeof animate> | null>(null);
  const collapseWidthRef = useRef<number | null>(null);
  const dragOffsetRef = useRef(0);
  const latestValueRef = useRef(defaultValue);
  const previousCollapsedRef = useRef(isLeftCollapsed);
  const sliderRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  let uncontrolledValue = uncontrolledState.value;

  if (uncontrolledState.persistenceSnapshot !== persistenceSnapshot) {
    const persistedValue =
      persistenceSnapshot && persistenceSnapshot !== splitWorkspaceServerSnapshot
        ? Number(persistenceSnapshot)
        : Number.NaN;
    uncontrolledValue = Number.isFinite(persistedValue) ? persistedValue : defaultValue;
    setUncontrolledState({
      persistenceSnapshot,
      value: uncontrolledValue
    });
  }

  const resolvedValue = clamp(value ?? uncontrolledValue, minimum, maximum);
  const preferenceProperty = splitWorkspacePreferenceProperty(persistenceKey);
  const isServerSnapshot = persistenceSnapshot === splitWorkspaceServerSnapshot;
  const initialUncontrolledValue = clamp(defaultValue, minimum, maximum);
  const styleValue =
    value === undefined && isServerSnapshot && preferenceProperty
      ? `clamp(${minimum}%, var(${preferenceProperty}, ${initialUncontrolledValue}%), ${maximum}%)`
      : `${resolvedValue}%`;
  const style: SplitWorkspaceStyle = {
    '--split-workspace-left': renderedCollapsed ? 'var(--spacing-collapsed-rail)' : styleValue
  };

  useEffect(() => {
    latestValueRef.current = resolvedValue;
  }, [resolvedValue]);

  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    const wasCollapsed = previousCollapsedRef.current;

    if (!workspace || wasCollapsed === isLeftCollapsed) {
      return;
    }

    previousCollapsedRef.current = isLeftCollapsed;
    collapseAnimationRef.current?.stop();

    const leftPane = workspace.firstElementChild as HTMLElement | null;
    const targetTrack = isLeftCollapsed ? 'var(--spacing-collapsed-rail)' : styleValue;
    const measuredStart = leftPane?.getBoundingClientRect().width ?? 0;
    const startWidth = collapseWidthRef.current ?? measuredStart;

    workspace.style.setProperty('--split-workspace-left', targetTrack);
    const targetWidth = leftPane?.getBoundingClientRect().width ?? 0;

    if (
      shouldReduceMotion ||
      isDragging ||
      startWidth <= 0 ||
      targetWidth <= 0 ||
      startWidth === targetWidth
    ) {
      collapseWidthRef.current = null;
      workspace.style.setProperty('--split-workspace-left', targetTrack);
      setRenderedCollapsed(isLeftCollapsed);
      return;
    }

    workspace.style.setProperty('--split-workspace-left', `${startWidth}px`);
    collapseAnimationRef.current = animate(startWidth, targetWidth, {
      ...splitWorkspaceMotion(workspace),
      onComplete() {
        collapseWidthRef.current = null;
        workspace.style.setProperty('--split-workspace-left', targetTrack);
        setRenderedCollapsed(isLeftCollapsed);
      },
      onUpdate(nextWidth) {
        collapseWidthRef.current = nextWidth;
        workspace.style.setProperty('--split-workspace-left', `${nextWidth}px`);
      }
    });

    return () => collapseAnimationRef.current?.stop();
  }, [isDragging, isLeftCollapsed, shouldReduceMotion, styleValue]);

  function updateValue(nextValue: number) {
    const boundedValue = clamp(nextValue, minimum, maximum);
    latestValueRef.current = boundedValue;

    // Pointer movement writes the shared coordinate synchronously so the divider
    // never waits for React scheduling before following the user's hand.
    workspaceRef.current?.style.setProperty('--split-workspace-left', `${boundedValue}%`);

    if (value === undefined) {
      setUncontrolledState({
        persistenceSnapshot,
        value: boundedValue
      });
    }

    onValueChange?.(boundedValue);
  }

  function persistValue(nextValue: number) {
    if (!persistenceKey) {
      return;
    }

    const serializedValue = String(Math.round(clamp(nextValue, minimum, maximum) * 1000) / 1000);

    try {
      window.localStorage.setItem(splitWorkspaceStorageKey(persistenceKey), serializedValue);
      window.dispatchEvent(new Event(splitWorkspacePersistenceEvent));
    } catch {
      // Resizing remains functional when storage is unavailable.
    }
  }

  useImperativeHandle(workspaceHandleRef, () => ({
    adjustBy(amount) {
      if (isLeftCollapsed) {
        return;
      }

      const nextValue = clamp(latestValueRef.current + amount, minimum, maximum);
      updateValue(nextValue);
      persistValue(nextValue);
    }
  }));

  function finishPointerDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (activePointerRef.current !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    activePointerRef.current = null;
    setIsDragging(false);
    persistValue(latestValueRef.current);
  }

  return (
    <div
      className={cx(
        'kitsune-split-workspace relative grid h-full min-h-0',
        splitWorkspaceAppearances[appearance],
        className
      )}
      data-collapsed={isLeftCollapsed ? 'true' : 'false'}
      data-resizing={isDragging || undefined}
      ref={workspaceRef}
      style={style}
    >
      <ScrollPane isScrollable={!isLeftCollapsed} onScroll={onLeftScroll} scrollRef={leftScrollRef}>
        <div
          aria-hidden={isLeftCollapsed || undefined}
          className="kitsune-split-expanded-pane min-h-full"
          inert={isLeftCollapsed || undefined}
        >
          {left}
        </div>
        {collapsedLeft ? (
          <div
            aria-hidden={!isLeftCollapsed || undefined}
            className="kitsune-split-collapsed-pane absolute inset-0"
            inert={!isLeftCollapsed || undefined}
          >
            {collapsedLeft}
          </div>
        ) : null}
      </ScrollPane>
      <div className="min-h-0 min-w-0 overflow-hidden">{right}</div>
      {!isLeftCollapsed ? (
        <>
          <Slider
            aria-label={ariaLabel}
            className="pointer-events-none absolute inset-0 z-10"
            maxValue={maximum}
            minValue={minimum}
            onChange={(nextValue) => {
              if (typeof nextValue === 'number') {
                const semanticValue = Math.round(resolvedValue);
                const keyboardValue =
                  nextValue === minimum || nextValue === maximum
                    ? nextValue
                    : resolvedValue + nextValue - semanticValue;
                updateValue(keyboardValue);
              }
            }}
            onChangeEnd={() => {
              persistValue(latestValueRef.current);
            }}
            ref={sliderRef}
            step={1}
            value={Math.round(resolvedValue)}
            orientation="horizontal"
          >
            <SliderOutput className="sr-only">{`${resolvedValue} percent`}</SliderOutput>
            <SliderTrack className="pointer-events-none absolute inset-0 opacity-0">
              <SliderThumb className="kitsune-split-semantic-thumb sr-only" />
            </SliderTrack>
          </Slider>
          {/*
            React Aria normalizes a SliderThumb within its track. The pane
            divider instead needs the literal workspace percentage, so this
            direct-manipulation surface forwards focus and value semantics to
            the React Aria Slider while sharing the grid's exact CSS coordinate.
          */}
          <div
            aria-hidden
            className={cx(
              'kitsune-split-handle group absolute inset-y-0 z-20 flex w-12 -translate-x-6',
              'cursor-col-resize touch-none items-center justify-center'
            )}
            data-dragging={isDragging || undefined}
            onPointerCancel={finishPointerDrag}
            onPointerDown={(event) => {
              if (event.pointerType === 'mouse' && event.button !== 0) {
                return;
              }

              const workspace = workspaceRef.current;

              if (!workspace) {
                return;
              }

              const bounds = workspace.getBoundingClientRect();

              if (bounds.width <= 0) {
                return;
              }

              const dividerX = bounds.left + (resolvedValue / 100) * bounds.width;
              dragOffsetRef.current = event.clientX - dividerX;
              latestValueRef.current = resolvedValue;
              activePointerRef.current = event.pointerId;
              event.currentTarget.setPointerCapture(event.pointerId);
              sliderRef.current?.querySelector<HTMLElement>('[role="slider"]')?.focus();
              setIsDragging(true);
              event.preventDefault();
            }}
            onPointerMove={(event) => {
              if (activePointerRef.current !== event.pointerId) {
                return;
              }

              const bounds = workspaceRef.current?.getBoundingClientRect();

              if (!bounds || bounds.width <= 0) {
                return;
              }

              const dividerX = event.clientX - dragOffsetRef.current;
              updateValue(((dividerX - bounds.left) / bounds.width) * 100);
            }}
            onPointerUp={finishPointerDrag}
          >
            <span
              className={cx(
                'kitsune-split-grip h-16 w-1 rounded-sm bg-border transition-colors',
                'duration-fast ease-out-quart',
                'group-hover:bg-accent'
              )}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
