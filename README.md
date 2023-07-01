# CRUD API

For all endpoints, an access token and email address must be provided in the headers. This is used to authenticate the user
ahead of any endpoints being called.

## Creating a user (POST)

Endpoint URL - http://localhost:3000/users

Example request
```
{
  "data": {
    "type": "user",
    "attributes": {
      "name": "John Doe",
      "email": "johndoe@example.com",
      "password": "password",
      "role": "USER"
    }
  }
}
```

## Getting a user (GET)

http://localhost:3000/users/{userId}


## Update a user (PATCH)

http://localhost:3000/users/{userId}

```
{
  "data": {
    "type": "user",
    "attributes": {
      "name": "James Doe",
      "email": "jamesdoe@example.com",
    }
  }
}
```

## Get all users (GET) (Admin only)

http://localhost:3000/users/1/role

## Update users role (PATCH)(Admin only)

```
{
  "data": {
    "type": "user",
    "attributes": {
      "role": "ADMIN"
    }
  }
}
```

## Delete a user (DELETE) (Admin only)

http://localhost:3000/users/1