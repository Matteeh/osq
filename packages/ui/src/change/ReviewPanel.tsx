import type { ReactElement } from 'react';
import type { WebReview } from '../contracts.js';
import { DeltaReview } from './DeltaReview.js';

export interface ReviewPanelProps {
  readonly review: WebReview;
}

interface ReviewSectionData {
  readonly title: string;
  readonly text: string;
}

function sections(review: WebReview): readonly ReviewSectionData[] {
  return [
    { title: 'Goal', text: review.goal },
    { title: 'Non-goals', text: review.nonGoals },
    { title: 'Surface', text: review.surface },
    { title: 'Decisions', text: review.decisions },
    { title: 'Human steps', text: review.humanSteps },
    { title: 'Contract', text: review.contract },
  ];
}

function ReviewSection({ title, text }: ReviewSectionData): ReactElement {
  return (
    <section className="review-section">
      <h3>{title}</h3>
      {text.length > 0 ? (
        <pre className="review-text">{text}</pre>
      ) : (
        <p className="review-none">None</p>
      )}
    </section>
  );
}

/** The proposal's review sections followed by every delta requirement. */
export function ReviewPanel({ review }: ReviewPanelProps): ReactElement {
  return (
    <div className="review">
      {sections(review).map((section) => (
        <ReviewSection key={section.title} title={section.title} text={section.text} />
      ))}
      <DeltaReview deltas={review.deltas} />
    </div>
  );
}
