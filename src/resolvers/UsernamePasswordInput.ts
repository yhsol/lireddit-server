import {
  InputType,
  Field,
} from "type-graphql";

// import argon2 from "argon2";
@InputType()
export class UsernamePasswordInput {
  @Field()
  username: string;
  @Field()
  email: string;
  @Field()
  password: string;
}
