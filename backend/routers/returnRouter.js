import express from "express";
import Return from '../models/returnModal.js'
import Product from "../models/productModel.js";
import Damage from "../models/damageModal.js";
import Log from "../models/Logmodal.js";
const returnRouter = express.Router();


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
  const session = await Return.startSession();
  session.startTransaction();

  try {
    const { returnNo, selectedBillingNo, returnDate, customerName, customerAddress, products } = req.body;

    // Filter out products with quantity 0
    const filteredProducts = products.filter((product) => product.quantity > 0);

    // Create new return
    const newReturn = new Return({
      returnNo,
      billingNo: selectedBillingNo,
      returnDate,
      customerName,
      customerAddress,
      products: filteredProducts,
    });

    // Save the return
    const savedReturn = await newReturn.save({ session });

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

    res.json(savedReturn);
  } catch (error) {
    // Abort the transaction in case of an error
    await session.abortTransaction();
    session.endSession();

    res.status(500).json({ message: 'Error creating return or updating stock', error });
  }
});



  // POST /api/damage/create
returnRouter.post('/damage/create', async (req, res) => {
    const { userName, damagedItems } = req.body;

    if (!userName || damagedItems.length === 0) {
      return res.status(400).json({ message: 'User name and damaged items are required.' });
    }
  
    try {
      // Save the damage bill
      const damage = new Damage({
        userName,
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
      const { returnDate, customerName, customerAddress, products } = req.body;
  
      // Filter out products with quantity 0
      const filteredProducts = products.filter((product) => product.quantity > 0);
  
      // Update return details
      const updatedReturn = await Return.findOneAndUpdate(
        { returnNo: returnNo },
        {
          returnDate,
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
