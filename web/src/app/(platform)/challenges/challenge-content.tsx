import { AuthoredContent, CodeBlock, DownloadLink } from '@/components/ui';
import type { ChallengeExperience } from '@/lib/challenges';

interface ChallengeDescriptionProps {
  challengeId: string;
  content: string;
}

export function ChallengeDescription({ challengeId, content }: ChallengeDescriptionProps) {
  return (
    <section
      aria-labelledby={`description-${challengeId}`}
      className="grid gap-3 rounded-md border border-border-subtle bg-surface-sunken p-4"
    >
      <h3 className="m-0 text-sm font-semibold text-text" id={`description-${challengeId}`}>
        Description
      </h3>
      <AuthoredContent content={content} />
    </section>
  );
}

interface ChallengeResourcesProps {
  attachments: ChallengeExperience['attachments'];
  challengeId: string;
  connection?: string | null;
}

export function ChallengeResources({
  attachments,
  challengeId,
  connection
}: ChallengeResourcesProps) {
  if (!connection && attachments.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby={`resources-${challengeId}`} className="grid gap-3">
      <h3 className="m-0 text-sm font-semibold text-text" id={`resources-${challengeId}`}>
        Resources
      </h3>
      {connection ? <CodeBlock code={connection} label="Connection" /> : null}
      {attachments.length > 0 ? (
        <ul className="m-0 grid list-none gap-2 p-0">
          {attachments.map((attachment) => (
            <li
              className="flex flex-wrap items-center justify-between gap-4 rounded-md bg-surface-sunken px-3 py-2"
              key={attachment.id}
            >
              <span className="grid gap-1">
                <strong className="text-base text-text">{attachment.label}</strong>
                <span className="text-sm text-text-muted">{attachment.size}</span>
              </span>
              <DownloadLink aria-label={`Download ${attachment.label}`} href={attachment.url}>
                Download
              </DownloadLink>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
