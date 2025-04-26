const express = require('express');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const bodyParser = require('body-parser');
const cors = require('cors');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { Kafka } = require('kafkajs');

// Configuration Proto
const movieProtoPath = './movie.proto';
const tvShowProtoPath = './tvShow.proto';

const movieProtoDefinition = protoLoader.loadSync(movieProtoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
});

const tvShowProtoDefinition = protoLoader.loadSync(tvShowProtoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
});

const movieProto = grpc.loadPackageDefinition(movieProtoDefinition).movie;
const tvShowProto = grpc.loadPackageDefinition(tvShowProtoDefinition).tvShow;

// Configuration GraphQL
const typeDefs = `#graphql
    type Movie {
        id: String!
        title: String!
        description: String!
    }

    type TVShow {
        id: String!
        title: String!
        description: String!
    }

    type Query {
        movie(id: String!): Movie
        movies: [Movie]
        tvShow(id: String!): TVShow
        tvShows: [TVShow]
    }

    type Mutation {
        createMovie(title: String!, description: String!): Movie
        createTVShow(title: String!, description: String!): TVShow
    }
`;

const resolvers = {
    Query: {
        movie: (_, { id }) => new Promise((resolve, reject) => {
            const client = new movieProto.MovieService('localhost:50051', grpc.credentials.createInsecure());
            client.GetMovie({ movie_id: id }, (err, response) => {
                err ? reject(err) : resolve(response.movie);
            });
        }),
        movies: () => new Promise((resolve, reject) => {
            const client = new movieProto.MovieService('localhost:50051', grpc.credentials.createInsecure());
            client.SearchMovies({ query: '' }, (err, response) => {
                err ? reject(err) : resolve(response.movies);
            });
        }),
        tvShow: (_, { id }) => new Promise((resolve, reject) => {
            const client = new tvShowProto.TVShowService('localhost:50052', grpc.credentials.createInsecure());
            client.GetTVShow({ tv_show_id: id }, (err, response) => {
                err ? reject(err) : resolve(response.tv_show);
            });
        }),
        tvShows: () => new Promise((resolve, reject) => {
            const client = new tvShowProto.TVShowService('localhost:50052', grpc.credentials.createInsecure());
            client.SearchTVShows({ query: '' }, (err, response) => {
                err ? reject(err) : resolve(response.tv_shows);
            });
        })
    },
    Mutation: {
        createMovie: (_, { title, description }) => new Promise((resolve, reject) => {
            const client = new movieProto.MovieService('localhost:50051', grpc.credentials.createInsecure());
            client.CreateMovie({ title, description }, (err, response) => {
                err ? reject(err) : resolve(response.movie);
            });
        }),
        createTVShow: (_, { title, description }) => new Promise((resolve, reject) => {
            const client = new tvShowProto.TVShowService('localhost:50052', grpc.credentials.createInsecure());
            client.CreateTVShow({ title, description }, (err, response) => {
                err ? reject(err) : resolve(response.tv_show);
            });
        })
    }
};

// Configuration Express
const app = express();
const server = new ApolloServer({ typeDefs, resolvers });

// Configuration Kafka
const kafka = new Kafka({ clientId: 'api-gateway', brokers: ['localhost:9092'] });

server.start().then(() => {
    app.use(cors(), bodyParser.json(), expressMiddleware(server));
});

// Endpoints REST
app.post('/movies', async (req, res) => {
    const producer = kafka.producer();
    await producer.connect();
    await producer.send({
        topic: 'movies_topic',
        messages: [{ value: JSON.stringify(req.body) }]
    });
    res.json({ status: 'Movie event sent to Kafka' });
});

app.post('/tvshows', async (req, res) => {
    const producer = kafka.producer();
    await producer.connect();
    await producer.send({
        topic: 'tvshows_topic',
        messages: [{ value: JSON.stringify(req.body) }]
    });
    res.json({ status: 'TVShow event sent to Kafka' });
});

app.listen(3000, () => console.log('API Gateway running on port 3000'));