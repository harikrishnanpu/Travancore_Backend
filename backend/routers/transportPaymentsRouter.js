// controllers/transportPaymentController.js
import express from 'express';
import TransportPayment from '../models/transportPayments.js';
import PaymentsAccount from '../models/paymentsAccountModal.js';


const transportPaymentsRouter = express.Router();

// Get transport suggestions based on partial transport name
transportPaymentsRouter.get('/suggestions', async (req, res) => {
  try {
    const search = req.query.search || '';
    const regex = new RegExp(search, 'i'); // case-insensitive search
    const transports = await TransportPayment.find({ transportName: regex }).select('transportName');
    res.json(transports);
  } catch (error) {
    console.error('Error fetching transport suggestions:', error);
    res.status(500).json({ message: 'Error fetching transport suggestions' });
  }
});

// Get transport details by ID
transportPaymentsRouter.get('/get/:id', async (req, res) => {
  try {
    const transport = await TransportPayment.findById(req.params.id);
    if (!transport) {
      return res.status(404).json({ message: 'Transport not found' });
    }
    res.json(transport);
  } catch (error) {
    console.error('Error fetching transport details:', error);
    res.status(500).json({ message: 'Error fetching transport details' });
  }
});


transportPaymentsRouter.get('/get-transport/:id', async (req, res) => {
  try {
    const transport = await TransportPayment.findById(req.params.id);
    if (!transport) {
      return res.status(404).json({ message: 'Transport not found' });
    }
    res.json(transport);
  } catch (error) {
    console.error('Error fetching transport details:', error);
    res.status(500).json({ message: 'Error fetching transport details' });
  }
});

// Add a payment to a transport
transportPaymentsRouter.post('/add-payments/:id', async (req, res) => {
  const paymentReferenceId = 'PAY' + Date.now().toString();
  try {
    const transport = await TransportPayment.findById(req.params.id);
    if (!transport) {
      return res.status(404).json({ message: 'Transport not found' });
    }

    const { amount, method, date, remark, transportName, transportId } = req.body;

    if (!amount || !method || !date) {
      return res.status(400).json({ message: 'Amount, method, and date are required' });
    }

    const payment = {
      amount,
      method,
      date,
      remark,
      referenceId: paymentReferenceId,
      submittedBy: req.user ? req.user.name : 'Unknown', // Assuming you have user authentication
    };


    const accountPaymentEntry = {
      amount: amount,
      method: method,
      remark: `Transportation Payment to ${transportName} - ${transportId}`,
      referenceId: paymentReferenceId,
      submittedBy: req.body.userId,
    };
  
    try {
      const account = await PaymentsAccount.findOne({ accountId: method });
    
      if (!account) {
        console.log(`No account found for accountId: ${method}`);
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Payment account not found' });
      }
    
      account.paymentsOut.push(accountPaymentEntry);
    
      await account.save();

    }catch(error){
      console.error('Error processing payment:', error);
      return res.status(500).json({ message: 'Error processing payment', error });
    }

    await transport.addPayment(payment);
    res.json({ message: 'Payment added successfully' });
  } catch (error) {
    console.error('Error adding payment:', error);
    res.status(500).json({ message: 'Error adding payment' });
  }
});

// Add a billing to a transport
transportPaymentsRouter.post('/add-billing/:id', async (req, res) => {
  try {
    const transport = await TransportPayment.findById(req.params.id);
    if (!transport) {
      return res.status(404).json({ message: 'Transport not found' });
    }

    const { amount, date, transportId, invoiceNo } = req.body;

    if (!amount || !transportId || !invoiceNo) {
      return res.status(400).json({ message: 'Amount, transportId, and invoiceNo are required' });
    }

    const billing = {
      amount,
      date,
      transportId,
      invoiceNo,
    };

    await transport.addBilling(billing);
    res.json({ message: 'Billing added successfully' });
  } catch (error) {
    console.error('Error adding billing:', error);
    res.status(500).json({ message: 'Error adding billing' });
  }
});



// GET route to fetch transport payments for a specific date
// transportPaymentsRouter.js

transportPaymentsRouter.get('/daily/payments', async (req, res) => {
  try {
    const { date } = req.query;

    // Validate if date is provided
    if (!date) {
      return res.status(400).json({ message: 'Date is required' });
    }

    // Parse the date and define the start and end of the day in UTC
    const selectedDate = new Date(date);
    selectedDate.setUTCHours(0, 0, 0, 0);

    const nextDate = new Date(selectedDate);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);

    // Use aggregation to unwind payments and filter by date
    const transports = await TransportPayment.aggregate([
      { $unwind: '$payments' },
      {
        $match: {
          'payments.date': { $gte: selectedDate, $lt: nextDate },
        },
      },
      {
        $group: {
          _id: '$transportId',
          transportName: { $first: '$transportName' },
          payments: { $push: '$payments' },
        },
      },
    ]);

    res.json(transports);
  } catch (error) {
    console.error('Error fetching transport payments:', error);
    res.status(500).json({ message: 'Error fetching transport payments' });
  }
});


// Get All Transport Payments
transportPaymentsRouter.get('/all', async (req, res) => {
  try {
    const payments = await TransportPayment.find({});
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});




// Update Transport Payment
transportPaymentsRouter.put('/:id/update', async (req, res) => {
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

// Delete Transport Payment
transportPaymentsRouter.delete('/:id/delete', async (req, res) => {
  try {
    const payment = await TransportPayment.findById(req.params.id);
    if (payment) {
      await payment.remove();
      res.json({ message: 'Transport payment record deleted successfully.' });
    } else {
      res.status(404).json({ message: 'Transport payment not found.' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});



transportPaymentsRouter.post('/create', async (req, res) => {
  try {
    const transportPayment = new TransportPayment(req.body);
    const createdPayment = await transportPayment.save();
    res.status(201).json(createdPayment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});




export default transportPaymentsRouter;
