import { Router } from 'express';
import { validateBody, validateQuery } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  CreateSegmentSchema,
  PreviewSegmentSchema,
  ListSegmentsQuerySchema,
} from './segments.schema';
import type { SegmentRule } from '../../db/schema';
import {
  previewSegment,
  createSegment,
  listSegments,
  getSegmentById,
  deleteSegment,
} from './segments.service';

const router = Router();

// POST /api/segments/preview — dry-run a rule set without saving it.
// The AI layer calls this to show a live count before the user saves.
// Must come BEFORE /:id routes to avoid matching "preview" as an id.
router.post(
  '/preview',
  validateBody(PreviewSegmentSchema),
  asyncHandler(async (req, res) => {
    const result = await previewSegment(req.body.rules as SegmentRule[]);
    res.json(result);
  })
);

// POST /api/segments — save a named segment
router.post(
  '/',
  validateBody(CreateSegmentSchema),
  asyncHandler(async (req, res) => {
    const segment = await createSegment(req.body);
    res.status(201).json(segment);
  })
);

// GET /api/segments — list all segments
router.get(
  '/',
  validateQuery(ListSegmentsQuerySchema),
  asyncHandler(async (req, res) => {
    const query = (req as typeof req & { validatedQuery: { page: number; limit: number } }).validatedQuery;
    res.json(await listSegments(query));
  })
);

// GET /api/segments/:id — get segment (add ?preview=true for a live count)
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const withPreview = String(req.query.preview) === 'true';
    res.json(await getSegmentById(req.params.id, withPreview));
  })
);

// DELETE /api/segments/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await deleteSegment(req.params.id);
    res.status(204).end();
  })
);

export default router;
