const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { Kafka } = require('kafkajs');
const mongoose = require('mongoose');

// Configuration MongoDB
mongoose.connect('mongodb://localhost:27017/moviesDB', { 
    useNewUrlParser: true, 
    useUnifiedTopology: true 
});

const Movie = mongoose.model('Movie', {
    title: String,
    description: String
});

// Configuration Kafka
const kafka = new Kafka({
    clientId: 'movie-service',
    brokers: ['localhost:9092']
});

// Configuration Proto
const movieProtoPath = './movie.proto';
const movieProtoDefinition = protoLoader.loadSync(movieProtoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
});
const movieProto = grpc.loadPackageDefinition(movieProtoDefinition).movie;

// Implémentation Service
const movieService = {
    GetMovie: async (call, callback) => {
        try {
            const movie = await Movie.findById(call.request.movie_id);
            callback(null, { movie });
        } catch (err) {
            callback(err);
        }
    },

    SearchMovies: async (call, callback) => {
        try {
            const movies = await Movie.find({ title: { $regex: call.request.query } });
            callback(null, { movies });
        } catch (err) {
            callback(err);
        }
    },

    CreateMovie: async (call, callback) => {
        const { title, description } = call.request;
        const movie = new Movie({ title, description });
        
        try {
            const savedMovie = await movie.save();
            
            // Envoi Kafka
            const producer = kafka.producer();
            await producer.connect();
            await producer.send({
                topic: 'movies_topic',
                messages: [{ value: JSON.stringify(savedMovie) }]
            });
            
            callback(null, { movie: savedMovie });
        } catch (err) {
            callback(err);
        }
    }
};

// Serveur gRPC
const server = new grpc.Server();
server.addService(movieProto.MovieService.service, movieService);
server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
    server.start();
    console.log('Movie Service running on port 50051');
});

// Consumer Kafka
const consumer = kafka.consumer({ groupId: 'movie-group' });
consumer.connect()
    .then(() => consumer.subscribe({ topic: 'tvshows_topic' }))
    .then(() => consumer.run({
        eachMessage: async ({ message }) => {
            console.log('[Movie Service] Received TVShow event:', message.value.toString());
        }
    }));