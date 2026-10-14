'use client';

import { useMemo, useState } from 'react';

import { ScoreHistoryChart } from './score-history-chart';
import { Button, Checkbox, Dialog, DialogTrigger, Select, showToast } from '@/components/ui';
import type { ScoreHistory, ScoreboardRow } from '@/lib/api/client';
import { createStepPath, extentDomain, plotSeries } from '@/lib/visualization/geometry';
import { buildScoreHistorySeries } from '@/lib/visualization/score-history';

type ExportFormat = 'image/jpeg' | 'image/png' | 'image/webp';

interface ScoreboardExportProps {
  eventName: string;
  history: ScoreHistory;
  rows: readonly ScoreboardRow[];
}

function cssToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function downloadCanvas(canvas: HTMLCanvasElement, format: ExportFormat, eventName: string) {
  const extension = format === 'image/jpeg' ? 'jpg' : format === 'image/webp' ? 'webp' : 'png';
  const filename = `${eventName.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')}-scoreboard.${extension}`;

  canvas.toBlob(
    (blob) => {
      if (!blob) {
        showToast({
          title: 'Scoreboard image could not be created',
          tone: 'danger'
        });
        return;
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      showToast({
        title: 'Scoreboard image downloaded',
        tone: 'success'
      });
    },
    format,
    0.92
  );
}

export function ScoreboardExport({ eventName, history, rows }: ScoreboardExportProps) {
  const [format, setFormat] = useState<ExportFormat>('image/png');
  const [includeGraph, setIncludeGraph] = useState(true);
  const [includeHeader, setIncludeHeader] = useState(true);
  const [includeSolves, setIncludeSolves] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [scale, setScale] = useState(2);
  const [teamCount, setTeamCount] = useState(5);
  const visibleRows = useMemo(() => rows.slice(0, teamCount), [rows, teamCount]);
  const visibleHistory = useMemo<ScoreHistory>(() => {
    const visibleIds = new Set(visibleRows.map((row) => row.competitor_id));
    return {
      ...history,
      series: history.series.filter((series) => visibleIds.has(series.competitor_id))
    };
  }, [history, visibleRows]);

  function exportImage() {
    setIsExporting(true);

    try {
      const width = 1200;
      const graphHeight = includeGraph ? 360 : 0;
      const headerHeight = includeHeader ? 128 : 48;
      const rowHeight = 56;
      const height = headerHeight + graphHeight + visibleRows.length * rowHeight + 64;
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Canvas is unavailable.');
      }

      context.scale(scale, scale);
      context.fillStyle = cssToken('--surface');
      context.fillRect(0, 0, width, height);
      context.fillStyle = cssToken('--text');
      context.font = '600 32px "Archivo Variable", sans-serif';

      if (includeHeader) {
        context.fillText(eventName, 48, 58);
        context.fillStyle = cssToken('--text-muted');
        context.font = '16px "Instrument Sans Variable", sans-serif';
        context.fillText('Scoreboard', 48, 90);
        context.fillText(new Date().toLocaleString(), width - 280, 58);
      }

      let offsetY = headerHeight;

      if (includeGraph) {
        const chartSeries = buildScoreHistorySeries(visibleHistory.series);
        const bounds = {
          bottom: offsetY + graphHeight - 48,
          height: graphHeight - 96,
          left: 48,
          right: width - 48,
          top: offsetY + 48,
          width: width - 96
        };
        const xDomain = extentDomain(
          chartSeries.flatMap((series) => series.points.map((point) => point.x))
        );
        const yDomain = extentDomain(
          chartSeries.flatMap((series) => series.points.map((point) => point.y)),
          {
            includeZero: true
          }
        );
        const model = plotSeries({
          bounds,
          series: chartSeries,
          xDomain,
          yDomain
        });
        context.strokeStyle = cssToken('--chart-grid');
        context.lineWidth = 1;

        for (let index = 0; index <= 4; index += 1) {
          const y = bounds.top + (bounds.height / 4) * index;
          context.beginPath();
          context.moveTo(bounds.left, y);
          context.lineTo(bounds.right, y);
          context.stroke();
        }

        model.plottedSeries.forEach((series, index) => {
          context.strokeStyle = cssToken(`--chart-series-${(index % 6) + 1}`);
          context.lineWidth = 3;
          context.lineCap = 'round';
          context.lineJoin = 'round';
          context.stroke(new Path2D(createStepPath(series.points)));
        });
        offsetY += graphHeight;
      }

      context.font = '16px "Instrument Sans Variable", sans-serif';
      visibleRows.forEach((row, index) => {
        const y = offsetY + index * rowHeight;
        context.fillStyle = index % 2 === 0 ? cssToken('--surface-raised') : cssToken('--surface');
        context.fillRect(32, y, width - 64, rowHeight);
        context.fillStyle = cssToken('--text');
        context.fillText(`#${row.rank}`, 48, y + 34);
        context.fillText(row.name, 128, y + 34);
        context.textAlign = 'right';

        if (includeSolves) {
          context.fillStyle = cssToken('--text-muted');
          context.fillText(`${row.solves} solves`, width - 200, y + 34);
        }

        context.fillStyle = cssToken('--text');
        context.font = '600 16px "Instrument Sans Variable", sans-serif';
        context.fillText(`${row.score.toLocaleString()} pts`, width - 48, y + 34);
        context.font = '16px "Instrument Sans Variable", sans-serif';
        context.textAlign = 'left';
      });

      downloadCanvas(canvas, format, eventName);
    } catch (caught) {
      showToast({
        description: caught instanceof Error ? caught.message : undefined,
        title: 'Scoreboard image could not be created',
        tone: 'danger'
      });
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <DialogTrigger>
      <Button size="small" tone="secondary">
        Export image
      </Button>
      <Dialog
        actions={
          <>
            <Button slot="close" tone="quiet">
              Close
            </Button>
            <Button isLoading={isExporting} onPress={exportImage}>
              Download image
            </Button>
          </>
        }
        description="Choose the standings and chart content included in the exported image."
        size="wide"
        title="Export scoreboard"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="grid content-start gap-4">
            <Select
              label="Teams"
              onSelectionChange={(key) => {
                setTeamCount(Number(key));
              }}
              options={[3, 5, 10, 20].map((value) => ({
                id: value,
                label: `Top ${value}`
              }))}
              selectedKey={teamCount}
            />
            <Select
              label="Format"
              onSelectionChange={(key) => {
                setFormat(String(key) as ExportFormat);
              }}
              options={[
                {
                  id: 'image/png',
                  label: 'PNG'
                },
                {
                  id: 'image/jpeg',
                  label: 'JPEG'
                },
                {
                  id: 'image/webp',
                  label: 'WebP'
                }
              ]}
              selectedKey={format}
            />
            <Select
              label="Resolution"
              onSelectionChange={(key) => {
                setScale(Number(key));
              }}
              options={[1, 2, 3].map((value) => ({
                id: value,
                label: `${value}×`
              }))}
              selectedKey={scale}
            />
            <Checkbox isSelected={includeHeader} onChange={setIncludeHeader}>
              Include header
            </Checkbox>
            <Checkbox isSelected={includeGraph} onChange={setIncludeGraph}>
              Include score graph
            </Checkbox>
            <Checkbox isSelected={includeSolves} onChange={setIncludeSolves}>
              Include solve counts
            </Checkbox>
          </div>
          <div className="grid content-start gap-4 rounded-lg border border-border-subtle bg-surface p-4">
            {includeHeader ? (
              <div className="grid gap-1 border-b border-border-subtle pb-4">
                <strong className="font-display text-lg text-text">{eventName}</strong>
                <span className="text-sm text-text-muted">Scoreboard preview</span>
              </div>
            ) : null}
            {includeGraph ? <ScoreHistoryChart history={visibleHistory} /> : null}
            <ol className="m-0 grid list-none divide-y divide-border-subtle p-0">
              {visibleRows.map((row) => (
                <li className="flex items-center gap-4 py-2 text-sm" key={row.competitor_id}>
                  <span className="w-8 tabular-nums text-text-muted">#{row.rank}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-text">{row.name}</span>
                  {includeSolves ? (
                    <span className="tabular-nums text-text-muted">{row.solves}</span>
                  ) : null}
                  <strong className="tabular-nums text-text">{row.score}</strong>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Dialog>
    </DialogTrigger>
  );
}
