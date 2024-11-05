import express from 'express';
import expressAsyncHandler from 'express-async-handler';
import Order from '../models/orderModel.js';
import Billing from '../models/billingModal.js';
import Return from '../models/returnModal.js';
import Damage from '../models/damageModal.js';
import User from '../models/userModel.js';
import Product from '../models/productModel.js';
import {
  isAdmin,
  isAuth,
  isSellerOrAdmin,
  mailgun,
  payOrderEmailTemplate,
} from '../utils.js';
import Purchase from '../models/purchasemodals.js';
import Log from '../models/Logmodal.js';

const orderRouter = express.Router();


orderRouter.get(
  '/',
  isAuth,
  isSellerOrAdmin,
  expressAsyncHandler(async (req, res) => {
    const seller = req.query.seller || '';
    const sellerFilter = seller ? { seller } : {};

    const orders = await Order.find({ ...sellerFilter }).populate(
      'user',
      'name'
    );
    res.send(orders);
  })
);


orderRouter.get('/purchase/:id', async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) {
      console.log("not found")
      return res.status(500).json({ message: 'Billing not found' });
    }
    res.status(200).json(purchase);
  } catch (error) {
    console.error('Error fetching purchase:', error);
    res.status(500).json({ message: 'Error fetching purchase', error });
  }
});

orderRouter.put('/purchase/:purchaseId', expressAsyncHandler(async (req, res) => {
  const { purchaseId } = req.params;
  const { sellerName, sellerId, invoiceNo, items } = req.body;

  try {
    // Find the existing purchase
    const existingPurchase = await Purchase.findById(purchaseId);
    if (!existingPurchase) {
      return res.status(404).json({ message: "Purchase not found" });
    }

    // Create a map of old item quantities for easy lookup
    const oldItemMap = new Map();
    for (const item of existingPurchase.items) {
      oldItemMap.set(item.itemId, item.quantity);
    }

    // Iterate over the new items to adjust stock values accordingly
    for (const item of items) {
      const product = await Product.findOne({ item_id: item.itemId });

      if (product) {
        const oldQuantity = oldItemMap.get(item.itemId) || 0; // Default to 0 if item wasn't in the old purchase
        const newQuantity = parseInt(item.quantity);

        if (newQuantity === 0) {
          // If the new quantity is 0, restore the stock by the old quantity
          product.countInStock -= oldQuantity;

          // Remove the item from the purchase
          await Purchase.updateOne(
            { _id: purchaseId },
            { $pull: { items: { itemId: item.itemId } } }
          );
        } else {
          // If the new quantity is greater than the old, increase stock
          if (newQuantity > oldQuantity) {
            const quantityDifference = newQuantity - oldQuantity;
            product.countInStock += quantityDifference; 
          } else if (newQuantity < oldQuantity) {
            // If the new quantity is less, increase stock
            const quantityDifference = oldQuantity - newQuantity;
            product.countInStock -= quantityDifference; 
          }

          // Ensure stock is not negative
          if (product.countInStock < 0) {
            throw new Error(`Insufficient stock for product: ${product.name}`);
          }

          // Update product price
          product.price = parseInt(item.price);
        }

        // Save the updated product stock
        await product.save();
      } else {
          const newProduct = new Product({
            name: item.name,
            item_id: item.itemId,
            brand: item.brand,
            category: item.category,
            countInStock: item.quantity,
            // Add other necessary fields here (e.g., description, price, etc.)
          });
          await newProduct.save();
          console.log("product saved")
      }
    }

    // Filter out items with zero quantity for the updated items list
    const updatedItems = items.filter(item => item.quantity > 0);

    if (updatedItems.length === 0) {
      // If no items left, delete the purchase
      await Purchase.findByIdAndDelete(purchaseId);
      return res.status(200).json({ message: "Purchase deleted as there were no items left" });
    }

    // Update the existing purchase with the new data
    existingPurchase.sellerName = sellerName;
    existingPurchase.sellerId = sellerId;
    existingPurchase.invoiceNo = invoiceNo;
    existingPurchase.items = updatedItems;

    const updatedPurchase = await existingPurchase.save();
    res.status(200).json(updatedPurchase);

  } catch (error) {
    console.error("Error occurred:", error);
    res.status(500).json({ message: "An error occurred", error: error.message });
  }
}));





// Route to get purchase number suggestions
orderRouter.get("/suggestions/purchase/suggestions", async (req, res) => {
  try {
    let { search = "" } = req.query;
     search = (req.query.search || "").replace(/\s+/g, "").toUpperCase();
    // Search both `invoiceNo` and `customerName` fields
    const suggestions = await Purchase.find({
      $or: [
        { invoiceNo: { $regex: search, $options: "i" } },
        { sellerName: { $regex: search, $options: "i" } }
      ]
    }).limit(5); // Limit suggestions to 5

    res.status(200).json(suggestions);
  } catch (error) {
    res.status(500).json({ message: "Error fetching suggestions" });
  }
});



orderRouter.get(
  '/summary',
  isAuth,
  isAdmin,
  expressAsyncHandler(async (req, res) => {
    const orders = await Order.aggregate([
      {
        $group: {
          _id: null,
          numOrders: { $sum: 1 },
          totalSales: { $sum: '$totalPrice' },
        },
      },
    ]);
    const users = await User.aggregate([
      {
        $group: {
          _id: null,
          numUsers: { $sum: 1 },
        },
      },
    ]);
    const dailyOrders = await Order.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orders: { $sum: 1 },
          sales: { $sum: '$totalPrice' },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const productCategories = await Product.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
        },
      },
    ]);
    res.send({ users, orders, dailyOrders, productCategories });
  })
);

orderRouter.get(
  '/mine',
  isAuth,
  expressAsyncHandler(async (req, res) => {
    const orders = await Order.find({ user: req.user._id });
    res.send(orders);
  })
);

orderRouter.post(
  '/',
  isAuth,
  expressAsyncHandler(async (req, res) => {
    if (req.body.orderItems.length === 0) {
      res.status(400).send({ message: 'Cart is empty' });
    } else {
      const order = new Order({
        seller: req.body.orderItems[0].seller,
        orderItems: req.body.orderItems,
        shippingAddress: req.body.shippingAddress,
        paymentMethod: req.body.paymentMethod,
        itemsPrice: req.body.itemsPrice,
        shippingPrice: req.body.shippingPrice,
        taxPrice: req.body.taxPrice,
        totalPrice: req.body.totalPrice,
        user: req.user._id,
      });
      const createdOrder = await order.save();
      res
        .status(201)
        .send({ message: 'New Order Created', order: createdOrder });
    }
  })
);

// orderRouter.get(
//   '/:id',
//   isAuth,
//   expressAsyncHandler(async (req, res) => {
//     const order = await Order.findById(req.params.id);
//     if (order) {
//       res.send(order);
//     } else {
//       res.status(404).send({ message: 'Order Not Found' });
//     }
//   })
// );

orderRouter.put(
  '/:id/pay',
  isAuth,
  expressAsyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id).populate(
      'user',
      'email name'
    );
    if (order) {
      order.isPaid = true;
      order.paidAt = Date.now();
      order.paymentResult = {
        id: req.body.id,
        status: req.body.status,
        update_time: req.body.update_time,
        email_address: req.body.email_address,
      };
      const updatedOrder = await order.save();
      try {
        mailgun()
          .messages()
          .send(
            {
              from: 'Amazona <amazona@mg.yourdomain.com>',
              to: `${order.user.name} <${order.user.email}>`,
              subject: `New order ${order._id}`,
              html: payOrderEmailTemplate(order),
            },
            (error, body) => {
              if (error) {
                console.log(error);
              } else {
                console.log(body);
              }
            }
          );
      } catch (err) {
        console.log(err);
      }

      res.send({ message: 'Order Paid', order: updatedOrder });
    } else {
      res.status(404).send({ message: 'Order Not Found' });
    }
  })
);

orderRouter.delete(
  '/:id',
  isAuth,
  isAdmin,
  expressAsyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (order) {
      const deleteOrder = await order.remove();
      res.send({ message: 'Order Deleted', order: deleteOrder });
    } else {
      res.status(404).send({ message: 'Order Not Found' });
    }
  })
);

orderRouter.put(
  '/:id/deliver',
  isAuth,
  isAdmin,
  expressAsyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (order) {
      order.isDelivered = true;
      order.deliveredAt = Date.now();

      const updatedOrder = await order.save();
      res.send({ message: 'Order Delivered', order: updatedOrder });
    } else {
      res.status(404).send({ message: 'Order Not Found' });
    }
  })
);


orderRouter.get('/summary/all', async (req,res)=>{
  const Allusers = await User.count()
  const AllBills = await Billing.count()
  const AllReturns = await Return.count()
  const AllProducts = await Product.count()
  const AllPurchases = await Purchase.count()
  const AllDamages = await Damage.count()
  const bills = await Billing.find(); // Get all bills
  const Billingsum = bills.reduce((sum, bill) => sum + parseInt(bill.billingAmount), 0); // Calculate the sum

  const outOfStock = await Product.countDocuments({ countInStock: 0 });
  const summary = {users : Allusers ,bills : AllBills,returns: AllReturns,products: AllProducts,purchases: AllPurchases,damages: AllDamages,Billingsum: Billingsum, Allbills: bills,outOfStockProducts: outOfStock}
  if(summary){
    res.json(summary)
  }else{
    res.status(500).send({msg:"error"})
  }

})

export default orderRouter;
