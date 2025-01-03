import bcrypt from 'bcryptjs';

const data = {
  users: [
    {
      name: 'Hari',
      email: 'admin@tc.com',
      isSuper: true,
      password: bcrypt.hashSync('1234', 8),
      isAdmin: true,
      isSeller: true,
      seller: {
        name: 'KK',
        logo: '/images/',
        description: 'best seller',
        rating: 4.5,
        numReviews: 120,
      },
    },
  ],
  products: [
    {
      "name": "ALINTA AZIZA 2X2",
      "item_id": "K1",
      "category": "TILES",
      "image": "/image/",
      "price": null,
      "countInStock": 0,
      "brand": "ALINTA",
      "rating": 0,
      "numReviews": 0,
      "description": "high quality product",
      "pUnit": "BOX",
      "sUnit": "NOS",
      "psRatio": 4,
      "length": 2,
      "breadth": 2,
      "size": "2X2",
      "unit": "FT",
      "actLength": 1,
      "actBreadth": 1,
      "type": ""
    },
    {
      "name": "ALINTA AMBER 2X2",
      "item_id": "K2",
      "category": "TILES",
      "image": "/image/",
      "price": null,
      "countInStock": 0,
      "brand": "ALINTA",
      "rating": 0,
      "numReviews": 0,
      "description": "high quality product",
      "pUnit": "BOX",
      "sUnit": "NOS",
      "psRatio": 4,
      "length": 2,
      "breadth": 2,
      "size": "2X2",
      "unit": "FT",
      "actLength": 1,
      "actBreadth": 1,
      "type": ""
    },
    
  ]
};


export default data;
