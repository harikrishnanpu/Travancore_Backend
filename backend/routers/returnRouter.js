import express from "express";
import Return from '../models/returnModal.js'
import Product from "../models/productModel.js";
import Damage from "../models/damageModal.js";
import Log from "../models/Logmodal.js";
const returnRouter = express.Router();
import mongoose from "mongoose";
import Billing from "../models/billingModal.js";


returnRouter.get('/',async (req,res)=>{
    try{
        const allReturns = await Return.find().sort({createdAt: -1});
        res.status(200).json(allReturns)
    }catch (error){
        res.status(500).json({message: "Error Fetching"})
    }
})

// Create new return
returnRouter.post('/create', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      billingNo,
      returnDate,
      customerName,
      customerAddress,
      products,
      returnAmount,
      totalTax,
      netReturnAmount,
    } = req.body;

    let { returnNo } = req.body;

    // Validate required fields
    if (
      !returnNo ||
      !billingNo ||
      !returnDate ||
      !customerName ||
      !customerAddress ||
      !Array.isArray(products) ||
      products.length === 0 ||
      returnAmount === undefined ||
      totalTax === undefined ||
      netReturnAmount === undefined
    ) {
      throw new Error('All fields are required and must be valid.');
    }

    // Check for unique returnNo
    const existingReturn = await Return.findOne({ returnNo }).session(session);
    if (existingReturn) {
      // Find the latest invoiceNo that starts with 'KK' and is followed by digits
      const latestInvoice = await Return.findOne({ returnNo: /^CN\d+$/ })
        .sort({ returnNo: -1 })
        .collation({ locale: "en", numericOrdering: true })

      if (!latestInvoice) {
        // If no invoice exists, start with 'KK001'
        returnNo = 'CN1';
      } else {
        const latestInvoiceNo = latestInvoice.returnNo;
        const numberPart = parseInt(latestInvoiceNo.replace('CN', ''), 10);
        const nextNumber = numberPart + 1;
        returnNo = `CN${nextNumber}`;
      }
    }

    // Validate Billing Number
    const billing = await Billing.findOne({ invoiceNo: billingNo }).session(session);
    if (!billing) {
      throw new Error(`Billing number ${billingNo} not found.`);
    }

    // Validate returned quantities against delivered quantities
    for (const product of products) {
      const billingProduct = billing.products.find(p => p.item_id === product.item_id);
      if (!billingProduct) {
        throw new Error(`Product with ID ${product.item_id} not found in billing.`);
      }

      // Assuming 'deliveredQuantity' is the field that tracks delivered amount
    }

    // Filter out products with quantity 0
    const filteredProducts = products.filter((product) => product.quantity > 0);

    // Create new return
    const newReturn = new Return({
      returnNo,
      billingNo,
      returnDate,
      customerName,
      customerAddress,
      returnAmount,
      totalTax,
      netReturnAmount,
      products: filteredProducts,
    });

    // Save the return
    const savedReturn = await newReturn.save({ session });

    // Update countInStock for each product and billing's returnedQuantity
    for (const product of filteredProducts) {
      const updatedProduct = await Product.findOne({ item_id: product.item_id }).session(session);

      if (!updatedProduct) {
        throw new Error(`Product with ID ${product.item_id} not found.`);
      }

      // Adjust countInStock (increase if product is returned)
      updatedProduct.countInStock += parseFloat(product.quantity);
      await updatedProduct.save({ session });

      // Update returnedQuantity in Billing
      const billingProduct = billing.products.find(p => p.item_id === product.item_id);
      billingProduct.returnedQuantity = (billingProduct.returnedQuantity || 0) + product.quantity;
    }

    // Optionally, recalculate Billing's financials if necessary
    // Example: Adjust billingAmountReceived or paymentStatus based on returns

    await billing.save({ session });

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    res.status(201).json(returnNo);
  } catch (error) {
    // Abort the transaction in case of an error
    await session.abortTransaction();
    session.endSession();

    console.error('Error creating return:', error);
    res.status(400).json({ message: error.message });
  }
});


  // POST /api/damage/create
returnRouter.post('/damage/create', async (req, res) => {
    const { userName, damagedItems, remark } = req.body;

    if (!userName || damagedItems.length === 0) {
      return res.status(400).json({ message: 'User name and damaged items are required.' });
    }
  
    try {
      // Save the damage bill
      const damage = new Damage({
        userName,
        remark,
        damagedItems
      });
      await damage.save();

      console.log("saved")
  
      // Reduce the countInStock for each damaged item
      for (const damagedItem of damagedItems) {
        await Product.findOneAndUpdate(
          { item_id: damagedItem.item_id },
          { $inc: { countInStock: -parseFloat(damagedItem.quantity) } },
          { new: true }
        );
      }
  
      res.status(201).json({ message: 'Damage bill created successfully and stock updated.' });

    } catch (error) {
      res.status(500).json({ message: 'Error creating damage bill or updating stock.', error });
    }
  });


  // GET /api/damage/getDamagedData
returnRouter.get('/damage/getDamagedData', async (req, res) => {
    try {
      const damagedData = await Damage.find().sort({createdAt: -1}); // Fetches all damaged items from the DB
      res.json(damagedData);
    } catch (error) {
      res.status(500).json({ message: 'Error retrieving damaged data.', error });
    }
  });


  returnRouter.delete('/damage/delete/:damageId/:itemId', async (req, res) => {
    try {
      const { damageId, itemId } = req.params;
  
      // Find the specific damage record by ID
      const damage = await Damage.findById(damageId);
  
      if (!damage) {
        return res.status(404).json({ message: 'Damage record not found' });
      }
  
      // Find the specific item within the damaged items array
      const itemIndex = damage.damagedItems.findIndex(item => item.item_id === itemId);
  
      if (itemIndex === -1) {
        return res.status(404).json({ message: 'Item not found in the damage bill' });
      }
  
      const item = damage.damagedItems[itemIndex];
  
      // Update the product stock for the item
      const product = await Product.findOne({ item_id: item.item_id });
  
      if (product) {
        product.countInStock += parseFloat(item.quantity);
        await product.save();
      }
  
      // Remove the specific item from the damaged items array
      damage.damagedItems.splice(itemIndex, 1);
  
      // If there are no items left in the damage bill, remove the entire document
      if (damage.damagedItems.length === 0) {
        await damage.remove();
        return res.send({ message: 'All items removed. Damage bill deleted.' });
      }
  
      // Otherwise, save the updated damage document
      await damage.save();
      res.send({ message: 'Item removed from the damage bill', updatedDamage: damage });
  
    } catch (error) {
      res.status(500).send({ message: 'Error occurred', error });
    }
  });
  


  returnRouter.delete('/return/delete/:id',async(req,res)=>{
    try{
      const ReturnEntry = await Return.findById(req.params.id)
  
      if (!ReturnEntry) {
        return res.status(404).json({ message: 'Purchase not found' });
      }
  
      // Loop through each item in the purchase and update product stock
      for (let item of ReturnEntry.products) {
        const product = await Product.findOne({item_id: item.item_id});
  
        if (product) {
          // Reduce the countInStock by the quantity in the purchase
          product.countInStock -= parseFloat(item.quantity)
  
          if (product.countInStock < 0) {
            product.countInStock = 0; // Ensure stock doesn't go below zero
          }
  
          await product.save();  // Save the updated product
        }
      }
  
      const deleteProduct = await ReturnEntry.remove();
      res.send({ message: 'Product Deleted', ReturnBill: deleteProduct });
    }catch(error){
      res.status(500).send({ message: 'Error Occured' });
    }
  });



  returnRouter.get('/lastreturn/id', async (req, res) => {
    try {
      const returnbill = await Return.findOne().sort({ createdAt: -1 });
      res.json(returnbill.returnNo);
    } catch (error) {
      res.status(500).json({ message: 'Error fetching last order' });
    }
  });


  // Get return suggestions
  returnRouter.get('/api/returns/suggestions', async (req, res) => {
    try {
      const search = req.query.search;
      const returns = await Return.find({ returnNo: { $regex: search, $options: 'i' } }).limit(10);
      res.json(returns);
    } catch (error) {
      res.status(500).send('Error fetching return suggestions');
    }
  });
  
  // Get return details by Return No
  returnRouter.get('/api/returns/details/:returnNo', async (req, res) => {
    try {
      const returnNo = req.params.returnNo;
      const returnData = await Return.findOne({ returnNo: returnNo });
      res.json(returnData);
    } catch (error) {
      res.status(500).send('Error fetching return details');
    }
  });
  
  // Update return details by Return No
  returnRouter.put('/api/returns/update/:returnNo', async (req, res) => {
    const session = await Return.startSession();
    session.startTransaction();
  
    try {
      const returnNo = req.params.returnNo;
      const {
        billingNo,
        returnDate,
        customerName,
        customerAddress,
        products,
        returnAmount,
        totalTax,
        netReturnAmount,
      } = req.body;
  
      // Filter out products with quantity 0
      const filteredProducts = products.filter((product) => product.quantity > 0);
  
      // Update return details
      const updatedReturn = await Return.findOneAndUpdate(
        { returnNo: returnNo },
        {
          returnDate,
          billingNo,
          returnAmount,
          totalTax,
          netReturnAmount,
          customerName,
          customerAddress,
          products: filteredProducts,
        },
        { new: true, session }
      );
  
      if (!updatedReturn) {
        throw new Error(`Return with No ${returnNo} not found`);
      }
  
      // Update countInStock for each product
      for (const product of filteredProducts) {
        const updatedProduct = await Product.findOne({ item_id: product.item_id }).session(session);
  
        if (!updatedProduct) {
          throw new Error(`Product with ID ${product.item_id} not found`);
        }
  
        // Adjust countInStock (increase if product is returned)
        updatedProduct.countInStock += parseFloat(product.quantity);
  
        await updatedProduct.save({ session });
      }
  
      // Commit the transaction
      await session.commitTransaction();
      session.endSession();
  
      res.json(updatedReturn);
    } catch (error) {
      // Abort the transaction in case of an error
      await session.abortTransaction();
      session.endSession();
  
      res.status(500).json({ message: 'Error updating return or updating stock', error });
    }
  });
  

export default returnRouter;
