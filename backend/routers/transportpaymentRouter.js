// routes/transportPayments.js

import express from 'express';
import TransportPayment from '../models/TransportPayment.js';

const transportPaymentRouter = express.Router();

// Create Transport Payment
transportPaymentRouter.post('/create', async (req, res) => {
  try {
    const transportPayment = new TransportPayment(req.body);
    const createdPayment = await transportPayment.save();
    res.status(201).json(createdPayment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get Transport Payment by ID
transportPaymentRouter.get('/get/:id', async (req, res) => {
  try {
    const payment = await TransportPayment.findById(req.params.id);
    if (payment) {
      res.json(payment);
    } else {
      res.status(404).json({ message: 'Transport payment not found.' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Transport Payment
transportPaymentRouter.put('/:id/update', async (req, res) => {
  try {
    const payment = await TransportPayment.findById(req.params.id);
    if (payment) {
      payment.transportName = req.body.transportName || payment.transportName;
      payment.transportType = req.body.transportType || payment.transportType;
      payment.billings = req.body.billings || payment.billings;
      payment.payments = req.body.payments || payment.payments;
      // totalAmountBilled, totalAmountPaid, paymentRemaining will be recalculated by pre-save middleware

      const updatedPayment = await payment.save();
      res.json(updatedPayment);
    } else {
      res.status(404).json({ message: 'Transport payment not found.' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

export default transportPaymentRouter;
