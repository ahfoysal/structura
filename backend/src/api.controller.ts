import { All, Controller, Req, Res } from "@nestjs/common"
import type { Request, Response } from "express"
import { ApiService } from "./api.service"

@Controller("api")
export class ApiController {
  constructor(private readonly api: ApiService) {}

  @All("*")
  async handle(@Req() request: Request, @Res() response: Response) {
    return this.api.handle(request, response)
  }
}
