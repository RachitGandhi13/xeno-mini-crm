import { Router } from 'express';
import { validateBody, validateQuery } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  CreateOrderSchema,
  ListOrdersQuerySchema,
} from './orders.schema';
import {
  createOrder,
  listOrdersByCustomer,
  getOrderById,
} from './orders.service';

const router = Router();

// POST /api/orders — create a new order (runs attribution check automatically)
router.post(
  '/',
  validateBody(CreateOrderSchema),
  asyncHandler(async (req, res) => {
    const order = await createOrder(req.body);
    res.status(201).json(order);
  })
);

// GET /api/orders/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getOrderById(req.params.id));
  })
);

// GET /api/orders/customer/:customerId — orders for a specific customer
router.get(
  '/customer/:customerId',
  validateQuery(ListOrdersQuerySchema),
  asyncHandler(async (req, res) => {
    const query = (req as typeof req & { validatedQuery: { page: number; limit: number } }).validatedQuery;
    res.json(await listOrdersByCustomer(req.params.customerId, query));
  })
);

export default router;
